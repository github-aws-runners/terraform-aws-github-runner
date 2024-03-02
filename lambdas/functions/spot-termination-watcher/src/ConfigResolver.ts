export class Config {
  createMetrics: boolean;

  constructor() {
    this.createMetrics = process.env.CREATE_METRICS === 'true';
  }
}
