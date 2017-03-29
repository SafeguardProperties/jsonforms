import { UISchemaElement, ControlElement, Layout } from '../models/uischema';
import { JsonFormsServiceElement, JsonFormService } from '../core';
import {Runtime} from '../core/runtime';
import { JsonSchema } from '../models/jsonSchema';
import { toDataPath } from '../path.util';
import {DataService, DataChangeListener} from '../core/data.service';

import * as AJV from 'ajv';

const ajv = new AJV({allErrors: true, jsonPointers: true, errorDataPath: 'property'});

@JsonFormsServiceElement({})
export class JsonFormsValidator implements DataChangeListener, JsonFormService {

  private validator: AJV.ValidateFunction;
  private pathToControlMap: {[path: string]: ControlElement} = {};

  constructor(private dataService: DataService, dataSchema: JsonSchema, uiSchema: UISchemaElement) {
    dataService.registerChangeListener(this);
    this.validator = ajv.compile(dataSchema);
    this.parseUiSchema(uiSchema);
  }

  isRelevantKey(_: ControlElement): boolean {
    return true;
  }

  notifyChange(uischema: ControlElement, newValue: any, data: any): void {
    // FIXME why do we need this?
    if (uischema != null) {
      this.parseUiSchema(uischema);
    }
    this.validate(data);
  }

  dispose(): void {
    this.dataService.unregisterChangeListener(this);
  }

  private parseUiSchema(uiSchema: UISchemaElement, prefix = ''): void {
    if (uiSchema.hasOwnProperty('elements')) {
      /* FIXME This checks for arrays, do we need this,
        as for each element in an array renderer an own validation service is created? */
      const hasScope = uiSchema['scope'] && uiSchema['scope']['$ref'];

      if (hasScope) {
        const instancePath = (prefix === '' ?
                '' : `${prefix}/`) + toDataPath(uiSchema['scope']['$ref']);
        (<Layout>uiSchema).elements.forEach((element, index) =>
            this.parseUiSchema(element, `${instancePath}/${index}`)
        );
      } else {
        (<Layout>uiSchema).elements.forEach((element, index) =>
            this.parseUiSchema(element, prefix)
        );
      }

    } else if (uiSchema.hasOwnProperty('scope')) {
      const control = <ControlElement> uiSchema;
      const instancePath = (prefix === '' ?
              '' : `${prefix}/`) + toDataPath(control.scope.$ref);
      this.pathToControlMap[instancePath] = control;
    }
  }

  private validate(data: any): void {
    this.cleanAllValidationErrors();
    const valid = this.validator(data);
    if (valid) {
      return;
    }
    const errors = this.validator.errors;
    errors.forEach(error => this.mapErrorToControl(error));
  }

  private mapErrorToControl(error: AJV.ErrorObject): void {
    const uiSchema = this.pathToControlMap[error.dataPath.substring(1)];

    if (uiSchema === undefined) {
      // FIXME should we log this at all?
      console.warn('No control for showing validation error @', error.dataPath.substring(1));
      return;
    }

    if (!uiSchema.hasOwnProperty('runtime')) {
      uiSchema['runtime'] = new Runtime();
    }
    const runtime = <Runtime> uiSchema['runtime'];
    runtime.validationErrors = [];
    runtime.validationErrors = runtime.validationErrors.concat(error.message);
  }

  private cleanAllValidationErrors(): void {
    Object.keys(this.pathToControlMap).forEach(key => {
      if (!this.pathToControlMap[key].hasOwnProperty('runtime')) {
        return;
      }
      (<Runtime> this.pathToControlMap[key]['runtime']).validationErrors = undefined;
    });
  }
}
