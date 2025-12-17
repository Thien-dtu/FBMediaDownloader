import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['scripts/**/*.test.js'],
        // Save test results to files
        reporters: ['default', 'json', 'html'],
        outputFile: {
            json: './test-results/results.json',
            html: './test-results/index.html',
        },
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html'],
            reportsDirectory: './test-results/coverage',
            include: ['scripts/**/*.js'],
            exclude: [
                'scripts/**/*.test.js',
                'scripts/bookmarks.js',
                'scripts/sql_playground.js',
                'scripts/sql_web.js',
            ],
        },
    },
});
