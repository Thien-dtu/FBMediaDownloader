/**
 * Tests for utils.js
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
    checkFileExist,
    createIfNotExistDir,
    deleteFile,
    parseUserIds,
    sleep
} from '../utils.js';

describe('utils.js', () => {
    const testDir = './test_temp_dir';
    const testFile = './test_temp_file.txt';

    afterEach(() => {
        // Cleanup
        if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
        if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true });
    });

    describe('checkFileExist', () => {
        it('should return false for non-existent file', () => {
            expect(checkFileExist('./nonexistent_file.xyz')).toBe(false);
        });

        it('should return true for existing file', () => {
            fs.writeFileSync(testFile, 'test');
            expect(checkFileExist(testFile)).toBe(true);
        });
    });

    describe('createIfNotExistDir', () => {
        it('should create directory if it does not exist', () => {
            expect(fs.existsSync(testDir)).toBe(false);
            createIfNotExistDir(testDir);
            expect(fs.existsSync(testDir)).toBe(true);
        });

        it('should not throw if directory already exists', () => {
            fs.mkdirSync(testDir, { recursive: true });
            expect(() => createIfNotExistDir(testDir)).not.toThrow();
        });
    });

    describe('deleteFile', () => {
        it('should delete existing file', () => {
            fs.writeFileSync(testFile, 'test');
            expect(fs.existsSync(testFile)).toBe(true);
            deleteFile(testFile);
            expect(fs.existsSync(testFile)).toBe(false);
        });

        it('should not throw for non-existent file', () => {
            expect(() => deleteFile('./nonexistent.txt')).not.toThrow();
        });
    });

    describe('parseUserIds', () => {
        it('should parse comma-separated UIDs', () => {
            const result = parseUserIds('123,456,789');
            expect(result).toEqual(['123', '456', '789']);
        });

        it('should trim whitespace', () => {
            const result = parseUserIds('  123 , 456 ,  789  ');
            expect(result).toEqual(['123', '456', '789']);
        });

        it('should filter empty values', () => {
            const result = parseUserIds('123,,456,');
            expect(result).toEqual(['123', '456']);
        });

        it('should return empty array for empty input', () => {
            expect(parseUserIds('')).toEqual([]);
            expect(parseUserIds('   ')).toEqual([]);
        });
    });

    describe('sleep', () => {
        it('should delay for specified milliseconds', async () => {
            const start = Date.now();
            await sleep(100);
            const elapsed = Date.now() - start;
            expect(elapsed).toBeGreaterThanOrEqual(90); // Allow some tolerance
            expect(elapsed).toBeLessThan(200);
        });
    });
});
