const importsLastRule = {
  meta: {
    type: "layout",
    docs: {
      description:
        "Require static imports to be grouped at the end of the file",
      recommended: false,
    },
    schema: [],
    messages: {
      importsLast:
        "Move all static imports to one contiguous block at the end of the file.",
    },
  },
  create(context) {
    const isStaticImport = (node) =>
      node.type === "ImportDeclaration" ||
      node.type === "TSImportEqualsDeclaration";

    return {
      Program(program) {
        const body = program.body;
        const importIndexes = [];

        for (let index = 0; index < body.length; index += 1) {
          if (isStaticImport(body[index])) {
            importIndexes.push(index);
          }
        }

        if (importIndexes.length === 0) {
          return;
        }

        const firstImportIndex = importIndexes[0];
        const expectedFirstImportIndex = body.length - importIndexes.length;

        if (firstImportIndex !== expectedFirstImportIndex) {
          context.report({
            node: body[firstImportIndex],
            messageId: "importsLast",
          });
          return;
        }

        for (
          let index = expectedFirstImportIndex;
          index < body.length;
          index += 1
        ) {
          if (!isStaticImport(body[index])) {
            context.report({
              node: body[index],
              messageId: "importsLast",
            });
            return;
          }
        }
      },
    };
  },
};

const importsLastPlugin = {
  meta: {
    name: "imports-last",
  },
  rules: {
    "imports-last": importsLastRule,
  },
};

export default importsLastPlugin;
export { importsLastRule };
