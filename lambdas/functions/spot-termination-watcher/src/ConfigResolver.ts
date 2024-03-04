export class Config {
  createMetrics: boolean;

  constructor() {
    this.createMetrics = process.env.ENABLE_METRICS === 'true';
  }
}
