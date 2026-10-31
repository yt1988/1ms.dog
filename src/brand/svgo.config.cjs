// Logo build: one-decimal precision everywhere. Whole units look the same in the paths but round the ~1400 gradient
// stop-opacity values to 0 or 1, which removes the muzzle shading and the red glow. ids, styles and groups are kept
// because the animation refers to them.
module.exports = {
  multipass: true,
  floatPrecision: 1,
  plugins: [
    {
      name: "preset-default",
      params: {
        overrides: {
          cleanupIds: false, inlineStyles: false, minifyStyles: false, removeUnknownsAndDefaults: false, mergePaths: false,
          convertShapeToPath: false, removeHiddenElems: false, collapseGroups: false, moveGroupAttrsToElems: false,
          moveElemsAttrsToGroup: false,
        },
      },
    },
    "removeMetadata",
  ],
};
