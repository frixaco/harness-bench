export const importsLastRule = {
  meta: {
    type: "layout",
    fixable: "code",
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
    const sourceCode = context.sourceCode ?? context.getSourceCode?.();

    const isStaticImport = (node) =>
      node.type === "ImportDeclaration" ||
      node.type === "TSImportEqualsDeclaration";

    const buildFix = (program) => {
      const body = program.body;

      if (body.length === 0) {
        return null;
      }

      const text = sourceCode.getText();
      const firstNodeStart = body[0].range[0];
      const rangeEnd = text.length;
      const originalText = text.slice(firstNodeStart, rangeEnd);
      const lineBreak = text.includes("\r\n") ? "\r\n" : "\n";

      const ensureTrailingBlankLine = (value) => {
        const doubleLineBreak = `${lineBreak}${lineBreak}`;

        if (value.endsWith(doubleLineBreak)) {
          return value;
        }

        if (value.endsWith(lineBreak)) {
          return `${value}${lineBreak}`;
        }

        return `${value}${doubleLineBreak}`;
      };

      const chunks = body.map((node, index) => {
        const nextNode = body[index + 1];
        const chunkEnd = nextNode ? nextNode.range[0] : rangeEnd;

        return {
          isImport: isStaticImport(node),
          text: text.slice(node.range[0], chunkEnd),
        };
      });

      const nonImportChunks = chunks.filter((chunk) => !chunk.isImport);
      const importChunks = chunks.filter((chunk) => chunk.isImport);
      const nonImportText = nonImportChunks.map((chunk) => chunk.text).join("");
      const importText = importChunks.map((chunk) => chunk.text).join("");

      const reorderedText =
        nonImportChunks.length > 0 && importChunks.length > 0
          ? `${ensureTrailingBlankLine(nonImportText)}${importText}`
          : `${nonImportText}${importText}`;

      if (reorderedText === originalText) {
        return null;
      }

      return {
        range: [firstNodeStart, rangeEnd],
        text: reorderedText,
      };
    };

    const report = (node, program) => {
      const fix = buildFix(program);
      const reportDescriptor = {
        node,
        messageId: "importsLast",
      };

      if (fix) {
        reportDescriptor.fix = (fixer) =>
          fixer.replaceTextRange(fix.range, fix.text);
      }

      context.report(reportDescriptor);
    };

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
          report(body[firstImportIndex], program);
          return;
        }

        for (
          let index = expectedFirstImportIndex;
          index < body.length;
          index += 1
        ) {
          if (!isStaticImport(body[index])) {
            report(body[index], program);
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
