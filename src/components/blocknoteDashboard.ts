import {
  BlockNoteSchema,
  combineByGroup,
  defaultBlockSpecs,
  type BlockNoteEditor,
  type BlockSchema,
  type BlockSpecs,
  type InlineContentSchema,
  type StyleSchema,
} from "@blocknote/core";
import * as locales from "@blocknote/core/locales";
import {
  getDefaultReactSlashMenuItems,
  type DefaultReactSuggestionItem,
} from "@blocknote/react";
import {
  getMultiColumnSlashMenuItems,
  locales as multiColumnLocales,
  multiColumnDropCursor,
  withMultiColumn,
} from "@blocknote/xl-multi-column";

export { multiColumnDropCursor };

export const dashboardBlockNoteDictionary = {
  ...locales.en,
  multi_column: multiColumnLocales.en,
};

/**
 * Dashboard BlockNote schema: default blocks + custom specs + official columns.
 */
export function createDashboardSchema<ExtraBlockSpecs extends BlockSpecs>(
  extraBlockSpecs: ExtraBlockSpecs
) {
  return withMultiColumn(
    BlockNoteSchema.create({
      blockSpecs: {
        ...defaultBlockSpecs,
        ...extraBlockSpecs,
      },
    })
  );
}

export function getDashboardSlashMenuItems<
  B extends BlockSchema,
  I extends InlineContentSchema,
  S extends StyleSchema,
>(
  editor: BlockNoteEditor<B, I, S>,
  extraItems: DefaultReactSuggestionItem[] = []
): DefaultReactSuggestionItem[] {
  return combineByGroup(
    getDefaultReactSlashMenuItems(editor),
    getMultiColumnSlashMenuItems(editor) as DefaultReactSuggestionItem[],
    extraItems
  );
}
