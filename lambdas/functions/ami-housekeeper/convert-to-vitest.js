#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Find all test files in the package
const findTestFiles = (dir) => {
  let results = [];
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      results = results.concat(findTestFiles(filePath));
    } else if (file.endsWith('.test.ts')) {
      results.push(filePath);
    }
  }
  
  return results;
};

// Convert Jest syntax to Vitest syntax
const convertJestToVitest = (filePath) => {
  console.log(`Converting ${filePath}`);
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Add import for Vitest functions if it doesn't already exist
  if (!content.includes('import { describe, it, expect, beforeEach, vi } from \'vitest\';')) {
    // Find the last import statement
    const lastImportIndex = content.lastIndexOf('import ');
    if (lastImportIndex !== -1) {
      const endOfImportIndex = content.indexOf(';', lastImportIndex);
      if (endOfImportIndex !== -1) {
        content = 
          content.slice(0, endOfImportIndex + 1) + 
          '\nimport { describe, it, expect, beforeEach, vi } from \'vitest\';\n' + 
          content.slice(endOfImportIndex + 1);
      }
    }
  }
  
  // Replace Jest specific functions with Vitest equivalents
  content = content.replace(/jest\./g, 'vi.');
  content = content.replace(/jest\(/g, 'vi(');
  
  // Replace test() with it()
  content = content.replace(/test\(/g, 'it(');
  
  // Replace mocked with vi.mocked
  if (content.includes('import { mocked } from \'jest-mock\';')) {
    content = content.replace('import { mocked } from \'jest-mock\';', '');
    content = content.replace(/mocked\(/g, 'vi.mocked(');
  }
  
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Converted ${filePath}`);
};

// Create a custom matcher utility function if it doesn't exist
const createTestUtilsFile = () => {
  const utilsPath = path.join(__dirname, 'src', 'test-utils.ts');
  
  // Check if directory exists, create if not
  const dir = path.dirname(utilsPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  // If file doesn't exist, create it
  if (!fs.existsSync(utilsPath)) {
    console.log(`Creating test utilities file at ${utilsPath}`);
    const content = `import { AwsClientStubSpy } from 'aws-sdk-client-mock';
import { expect } from 'vitest';

/**
 * Helper function to check if a command was received with specific input.
 * This provides similar functionality to toHaveReceivedCommandWith from aws-sdk-client-mock-jest.
 */
export function expectCommandCalledWith(mockClient: AwsClientStubSpy, command: any, expectedInput: any) {
  const calls = mockClient.commandCalls(command);
  expect(calls.length).toBeGreaterThan(0);
  expect(calls[0].args[0].input).toEqual(expectedInput);
}

/**
 * Helper function to check if a command was called a specific number of times.
 * This provides similar functionality to toHaveReceivedCommandTimes from aws-sdk-client-mock-jest.
 */
export function expectCommandCalledTimes(mockClient: AwsClientStubSpy, command: any, times: number) {
  const calls = mockClient.commandCalls(command);
  expect(calls.length).toBe(times);
}

/**
 * Helper function to check if a command was called at all.
 * This provides similar functionality to toHaveReceivedCommand from aws-sdk-client-mock-jest.
 */
export function expectCommandCalled(mockClient: AwsClientStubSpy, command: any) {
  const calls = mockClient.commandCalls(command);
  expect(calls.length).toBeGreaterThan(0);
}

/**
 * Helper function to check if a command was not called.
 */
export function expectCommandNotCalled(mockClient: AwsClientStubSpy, command: any) {
  const calls = mockClient.commandCalls(command);
  expect(calls.length).toBe(0);
}`;
    
    fs.writeFileSync(utilsPath, content, 'utf8');
    console.log(`Created test utilities file at ${utilsPath}`);
  } else {
    console.log(`Test utilities file already exists at ${utilsPath}`);
  }
  
  return utilsPath;
};

// Main function
const main = () => {
  // Create test utilities file
  createTestUtilsFile();
  
  const rootDir = path.join(__dirname, 'src');
  const testFiles = findTestFiles(rootDir);
  
  console.log(`Found ${testFiles.length} test files to convert`);
  
  let processed = 0;
  let failed = 0;
  
  for (const file of testFiles) {
    try {
      convertJestToVitest(file);
      processed++;
    } catch (error) {
      console.error(`Error processing ${file}:`, error);
      failed++;
    }
  }
  
  console.log(`\nSummary:`);
  console.log(`- Total: ${testFiles.length} files`);
  console.log(`- Processed: ${processed} files`);
  console.log(`- Failed: ${failed} files`);
};

main();
