export class SssError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SssError";
  }
}

export class FeatureNotEnabledError extends SssError {
  constructor(message = "Feature not enabled") {
    super(message);
    this.name = "FeatureNotEnabledError";
  }
}

export class UnsupportedPresetError extends SssError {
  constructor(message = "Unsupported preset") {
    super(message);
    this.name = "UnsupportedPresetError";
  }
}
