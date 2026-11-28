/** Default two-column form layout. Labels stack their control; `.check` is an inline checkbox row; `.wide` spans both columns. */
export const formGrid =
  "grid gap-3 md:grid-cols-2 md:items-end [&_label]:grid [&_label]:gap-1 [&_label]:text-sm [&_label]:font-medium [&_label]:text-fg [&_label.check]:flex [&_label.check]:items-center [&_label.check]:gap-2 [&_input[type=checkbox]]:size-5 [&_input[type=checkbox]]:accent-brand md:[&_.wide]:col-span-2";

export const inlineForm = "flex flex-wrap items-center gap-2";
export const plainList = "m-0 grid list-none gap-1.5 p-0 text-sm";

export const tableWrap = "overflow-x-auto";
export const dataTable =
  "w-full border-collapse text-[13px] [&_th]:border-b [&_th]:border-line [&_th]:px-3 [&_th]:py-2.5 [&_th]:text-start [&_th]:font-semibold [&_td]:border-b [&_td]:border-line [&_td]:px-3 [&_td]:py-2.5 [&_td]:text-start";
export const subNav =
  "sticky top-0 z-10 -mx-1 mb-4 flex gap-2 overflow-x-auto bg-bg/90 px-1 py-2 backdrop-blur [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";
export const subNavLink =
  "inline-flex min-h-10 shrink-0 items-center rounded-full border border-line bg-surface px-3.5 text-[13px] font-semibold text-fg transition-colors hover:border-brand hover:text-brand";
export const mutedSm = "m-0 mb-2 text-xs text-fg-muted";
