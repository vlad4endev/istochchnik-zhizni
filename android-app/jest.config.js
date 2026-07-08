module.exports = {
  projects: [
    {
      displayName: 'node',
      testMatch: ['**/__tests__/sync.*.test.ts'],
      testEnvironment: 'node',
      transform: {
        '^.+\\.tsx?$': [
          'babel-jest',
          {
            presets: ['@babel/preset-env', '@babel/preset-typescript'],
          },
        ],
      },
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
      },
    },
  ],
};
