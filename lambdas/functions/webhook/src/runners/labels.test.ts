import { describe, expect, it } from 'vitest';

import { canRunJob } from './labels';

describe('decides can run job based on label and config (canRunJob)', () => {
  it('should accept job with an exact match and identical labels.', () => {
    const workflowLabels = ['self-hosted', 'linux', 'x64', 'ubuntu-latest'];
    const runnerLabels = [['self-hosted', 'linux', 'x64', 'ubuntu-latest']];
    expect(canRunJob(workflowLabels, runnerLabels, true)).toBe(true);
  });

  it('should accept job with an exact match and identical labels, ignoring cases.', () => {
    const workflowLabels = ['self-Hosted', 'Linux', 'X64', 'ubuntu-Latest'];
    const runnerLabels = [['self-hosted', 'linux', 'x64', 'ubuntu-latest']];
    expect(canRunJob(workflowLabels, runnerLabels, true)).toBe(true);
  });

  it('should accept job with an exact match and runner supports requested capabilities.', () => {
    const workflowLabels = ['self-hosted', 'linux', 'x64'];
    const runnerLabels = [['self-hosted', 'linux', 'x64', 'ubuntu-latest']];
    expect(canRunJob(workflowLabels, runnerLabels, true)).toBe(true);
  });

  it('should NOT accept job with an exact match and runner not matching requested capabilities.', () => {
    const workflowLabels = ['self-hosted', 'linux', 'x64', 'ubuntu-latest'];
    const runnerLabels = [['self-hosted', 'linux', 'x64']];
    expect(canRunJob(workflowLabels, runnerLabels, true)).toBe(false);
  });

  it('should accept job with for a non exact match. Any label that matches will accept the job.', () => {
    const workflowLabels = ['self-hosted', 'linux', 'x64', 'ubuntu-latest', 'gpu'];
    const runnerLabels = [['gpu']];
    expect(canRunJob(workflowLabels, runnerLabels, false)).toBe(true);
  });

  it('should NOT accept job with for an exact match. Not all requested capabilities are supported.', () => {
    const workflowLabels = ['self-hosted', 'linux', 'x64', 'ubuntu-latest', 'gpu'];
    const runnerLabels = [['gpu']];
    expect(canRunJob(workflowLabels, runnerLabels, true)).toBe(false);
  });

  it('should match when runner has more labels than workflow requests with exactMatch=true (unidirectional).', () => {
    const workflowLabels = ['self-hosted', 'linux', 'x64', 'staging', 'ubuntu-2404'];
    const runnerLabels = [['self-hosted', 'linux', 'x64', 'staging', 'ubuntu-2404', 'on-demand']];
    expect(canRunJob(workflowLabels, runnerLabels, true)).toBe(true);
  });

  it('should match when labels are exactly identical with exactMatch=true.', () => {
    const workflowLabels = ['self-hosted', 'linux', 'on-demand'];
    const runnerLabels = [['self-hosted', 'linux', 'on-demand']];
    expect(canRunJob(workflowLabels, runnerLabels, true)).toBe(true);
  });

  it('should match with exactMatch=true when labels are in different order.', () => {
    const workflowLabels = ['linux', 'self-hosted', 'x64'];
    const runnerLabels = [['self-hosted', 'linux', 'x64']];
    expect(canRunJob(workflowLabels, runnerLabels, true)).toBe(true);
  });

  it('should match with exactMatch=true when labels are completely shuffled.', () => {
    const workflowLabels = ['x64', 'ubuntu-latest', 'self-hosted', 'linux'];
    const runnerLabels = [['self-hosted', 'linux', 'x64', 'ubuntu-latest']];
    expect(canRunJob(workflowLabels, runnerLabels, true)).toBe(true);
  });

  it('should match with exactMatch=false when labels are in different order.', () => {
    const workflowLabels = ['gpu', 'self-hosted'];
    const runnerLabels = [['self-hosted', 'gpu']];
    expect(canRunJob(workflowLabels, runnerLabels, false)).toBe(true);
  });

  // bidirectionalLabelMatch tests
  it('should NOT match when runner has more labels than workflow requests (bidirectionalLabelMatch=true).', () => {
    const workflowLabels = ['self-hosted', 'linux', 'x64', 'staging', 'ubuntu-2404'];
    const runnerLabels = [['self-hosted', 'linux', 'x64', 'staging', 'ubuntu-2404', 'on-demand']];
    expect(canRunJob(workflowLabels, runnerLabels, false, true)).toBe(false);
  });

  it('should NOT match when workflow has more labels than runner (bidirectionalLabelMatch=true).', () => {
    const workflowLabels = ['self-hosted', 'linux', 'x64', 'ubuntu-latest', 'gpu'];
    const runnerLabels = [['self-hosted', 'linux', 'x64']];
    expect(canRunJob(workflowLabels, runnerLabels, false, true)).toBe(false);
  });

  it('should match when labels are exactly identical with bidirectionalLabelMatch=true.', () => {
    const workflowLabels = ['self-hosted', 'linux', 'on-demand'];
    const runnerLabels = [['self-hosted', 'linux', 'on-demand']];
    expect(canRunJob(workflowLabels, runnerLabels, false, true)).toBe(true);
  });

  it('should match with bidirectionalLabelMatch=true when labels are in different order.', () => {
    const workflowLabels = ['linux', 'self-hosted', 'x64'];
    const runnerLabels = [['self-hosted', 'linux', 'x64']];
    expect(canRunJob(workflowLabels, runnerLabels, false, true)).toBe(true);
  });

  it('should match with bidirectionalLabelMatch=true when labels are completely shuffled.', () => {
    const workflowLabels = ['x64', 'ubuntu-latest', 'self-hosted', 'linux'];
    const runnerLabels = [['self-hosted', 'linux', 'x64', 'ubuntu-latest']];
    expect(canRunJob(workflowLabels, runnerLabels, false, true)).toBe(true);
  });

  it('should match with bidirectionalLabelMatch=true ignoring case.', () => {
    const workflowLabels = ['Self-Hosted', 'Linux', 'X64'];
    const runnerLabels = [['self-hosted', 'linux', 'x64']];
    expect(canRunJob(workflowLabels, runnerLabels, false, true)).toBe(true);
  });

  it('should NOT match empty workflow labels with bidirectionalLabelMatch=true.', () => {
    const workflowLabels: string[] = [];
    const runnerLabels = [['self-hosted', 'linux', 'x64']];
    expect(canRunJob(workflowLabels, runnerLabels, false, true)).toBe(false);
  });

  it('bidirectionalLabelMatch takes precedence over exactMatch when both are true.', () => {
    const workflowLabels = ['self-hosted', 'linux', 'x64'];
    const runnerLabels = [['self-hosted', 'linux', 'x64', 'ubuntu-latest']];
    // exactMatch alone would accept this (runner has extra labels), but bidirectional should reject
    expect(canRunJob(workflowLabels, runnerLabels, true, true)).toBe(false);
  });
});
