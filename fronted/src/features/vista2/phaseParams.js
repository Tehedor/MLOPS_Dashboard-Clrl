// Parámetros de cada fase extraídos de traceability_schema.yaml
// type: 'text' | 'integer' | 'float' | 'select' | 'json' | 'boolean'

export const PHASE_PARAMS = {

  f01_explore: [
    { id: 'raw_path',     label: 'raw_path',     type: 'text',    required: true  },
    { id: 'cleaning',     label: 'cleaning',     type: 'select',  required: true,  options: ['none', 'basic', 'strict'] },
    { id: 'nan_values',   label: 'nan_values',   type: 'json',    required: false, hint: '[-999999]' },
    { id: 'error_values', label: 'error_values', type: 'json',    required: false, hint: '{"col": [-1]}' },
    { id: 'first_line',   label: 'first_line',   type: 'integer', required: false },
    { id: 'max_lines',    label: 'max_lines',    type: 'integer', required: false },
  ],

  f02_events: [
    { id: 'Tu',       label: 'Tu',       type: 'integer', required: true,  inherited: true },
    { id: 'strategy', label: 'strategy', type: 'select',  required: true,  options: ['levels', 'transitions', 'both'] },
    { id: 'bands',    label: 'bands',    type: 'json',    required: true,  hint: '[10, 90]' },
    { id: 'nan_mode', label: 'nan_mode', type: 'select',  required: true,  options: ['keep', 'discard'] },
  ],

  f03_windows: [
    { id: 'parent_variant',   label: 'parent_variant',   type: 'text',    required: true  },
    { id: 'Tu',               label: 'Tu',               type: 'integer', required: false, inherited: true },
    { id: 'OW',               label: 'OW',               type: 'integer', required: true  },
    { id: 'LT',               label: 'LT',               type: 'integer', required: true  },
    { id: 'PW',               label: 'PW',               type: 'integer', required: true  },
    { id: 'window_strategy',  label: 'window_strategy',  type: 'select',  required: true,  options: ['synchro', 'asynOW', 'withinPW', 'asynPW'] },
    { id: 'nan_mode',         label: 'nan_mode',         type: 'select',  required: true,  options: ['keep', 'discard'] },
  ],

  f04_targets: [
    { id: 'parent_variant',     label: 'parent_variant',     type: 'text',    required: true  },
    { id: 'Tu',                 label: 'Tu',                 type: 'integer', required: false, inherited: true },
    { id: 'OW',                 label: 'OW',                 type: 'integer', required: false, inherited: true },
    { id: 'LT',                 label: 'LT',                 type: 'integer', required: false, inherited: true },
    { id: 'PW',                 label: 'PW',                 type: 'integer', required: false, inherited: true },
    { id: 'prediction_name',    label: 'prediction_name',    type: 'text',    required: true  },
    { id: 'target_operator',    label: 'target_operator',    type: 'select',  required: true,  options: ['OR'] },
    { id: 'target_event_types', label: 'target_event_types', type: 'json',    required: true,  hint: '["EventA", "EventB"]' },
  ],

  f05_modeling: [
    { id: 'parent_variant',               label: 'parent_variant',               type: 'text',    required: true  },
    { id: 'Tu',                           label: 'Tu',                           type: 'integer', required: false, inherited: true },
    { id: 'OW',                           label: 'OW',                           type: 'integer', required: false, inherited: true },
    { id: 'LT',                           label: 'LT',                           type: 'integer', required: false, inherited: true },
    { id: 'PW',                           label: 'PW',                           type: 'integer', required: false, inherited: true },
    { id: 'model_family',                 label: 'model_family',                 type: 'select',  required: true,  options: ['dense_bow', 'sequence_embedding', 'cnn1d'] },
    { id: 'imbalance_strategy',           label: 'imbalance_strategy',           type: 'select',  required: true,  options: ['none', 'rare_events', 'auto'] },
    { id: 'imbalance_max_majority_samples', label: 'imbalance_max_majority',     type: 'integer', required: false },
    { id: 'automl',                       label: 'automl',                       type: 'json',    required: true,  hint: '{"enabled": true, "max_trials": 5, "seed": 42}' },
    { id: 'training',                     label: 'training',                     type: 'json',    required: true,  hint: '{"epochs": 20, "max_samples": null}' },
    { id: 'evaluation',                   label: 'evaluation',                   type: 'json',    required: true,  hint: '{"split": {"train": 0.7, "val": 0.15, "test": 0.15}}' },
  ],

  f06_quant: [
    { id: 'parent_variant', label: 'parent_variant', type: 'text', required: true },
    { id: 'Tu',             label: 'Tu',             type: 'integer', required: false, inherited: true },
    { id: 'OW',             label: 'OW',             type: 'integer', required: false, inherited: true },
    { id: 'LT',             label: 'LT',             type: 'integer', required: false, inherited: true },
    { id: 'PW',             label: 'PW',             type: 'integer', required: false, inherited: true },
    { id: 'deployment',     label: 'deployment',     type: 'json', required: true,
      hint: '{"target":"esp32","runtime":"esp-tflite-micro","require_int8":true,"memory_limit_bytes":327680}' },
    { id: 'quantization',   label: 'quantization',   type: 'json', required: true,
      hint: '{"tflite_optimization":"DEFAULT","calibration_samples":512}' },
    { id: 'thresholding',   label: 'thresholding',   type: 'json', required: true,
      hint: '{"strategy":"recalibrate_on_quantized","maximize_metric":"recall","grid_points":101}' },
    { id: 'eedu',           label: 'eedu',           type: 'json', required: true,  hint: '{"version":"1.0","layout":"default"}' },
  ],

  f07_modval: [
    { id: 'parent_variant',   label: 'parent_variant',   type: 'text',    required: true  },
    { id: 'platform',         label: 'platform',         type: 'text',    required: true  },
    { id: 'MTI_MS',           label: 'MTI_MS',           type: 'integer', required: true  },
    { id: 'Tu',               label: 'Tu',               type: 'integer', required: false, inherited: true },
    { id: 'OW',               label: 'OW',               type: 'integer', required: false, inherited: true },
    { id: 'LT',               label: 'LT',               type: 'integer', required: false, inherited: true },
    { id: 'PW',               label: 'PW',               type: 'integer', required: false, inherited: true },
    { id: 'time_scale_factor',label: 'time_scale_factor',type: 'float',   required: false },
    { id: 'ITmax',            label: 'ITmax',            type: 'integer', required: false },
    { id: 'max_rows',         label: 'max_rows',         type: 'integer', required: false },
  ],

  f08_sysval: [
    { id: 'parents',          label: 'parents',          type: 'json',    required: true,  hint: '["v1_0001", "v1_0002"]' },
    { id: 'selection_mode',   label: 'selection_mode',   type: 'select',  required: true,  options: ['manual', 'auto_ilp'] },
    { id: 'platform',         label: 'platform',         type: 'text',    required: true  },
    { id: 'MTI_MS',           label: 'MTI_MS',           type: 'integer', required: true  },
    { id: 'objective',        label: 'objective',        type: 'select',  required: false, options: ['max_global_recall', 'global_recall', 'max_tp'] },
    { id: 'solver_time_limit_sec', label: 'solver_time_limit', type: 'integer', required: false },
    { id: 'time_scale_factor',label: 'time_scale_factor',type: 'float',   required: false },
    { id: 'max_models',       label: 'max_models',       type: 'integer', required: false },
    { id: 'memory_budget_bytes', label: 'memory_budget_bytes', type: 'integer', required: false },
    { id: 'min_quality_score',label: 'min_quality_score',type: 'float',   required: false },
    { id: 'min_precision',    label: 'min_precision',    type: 'float',   required: false },
    { id: 'min_recall',       label: 'min_recall',       type: 'float',   required: false },
    { id: 'max_rows',         label: 'max_rows',         type: 'integer', required: false },
  ],
}
