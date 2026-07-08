module.exports = function (api) {
  const isTest = api.env('test');
  api.cache(() => isTest);

  if (isTest) {
    return {
      presets: [['@babel/preset-env', {targets: {node: 'current'}}], '@babel/preset-typescript'],
    };
  }

  return {
    presets: ['module:@react-native/babel-preset', 'nativewind/babel'],
    plugins: [
      ['@babel/plugin-proposal-decorators', {legacy: true}],
      [
        'module-resolver',
        {
          root: ['./src'],
          extensions: ['.ios.js', '.android.js', '.js', '.ts', '.tsx', '.json'],
          alias: {
            '@': './src',
            '@shared': './src/shared',
          },
        },
      ],
    ],
  };
};
