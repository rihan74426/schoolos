/** Default two-column form layout. Labels stack their control; `.check` is an inline checkbox row; `.wide` spans both columns. */
export const formGrid =
  "grid gap-3 md:grid-cols-2 md:items-end [&_label]:grid [&_label]:gap-1 [&_label]:text-sm [&_label]:font-medium [&_label]:text-fg [&_label.check]:flex [&_label.check]:items-center [&_label.check]:gap-2 [&_input[type=checkbox]]:size-5 [&_input[type=checkbox]]:accent-brand md:[&_.wide]:col-span-2";

export const inlineForm = "flex flex-wrap items-center gap-2";
export const plainList = "m-0 grid list-none gap-1.5 p-0 text-sm";
