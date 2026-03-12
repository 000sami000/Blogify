type InlineToolOptions = {
  api: {
    selection?: {
      expandToTag?: (element: HTMLElement) => void;
    };
  };
  config?: {
    defaultColor?: string;
  };
};

const createHiddenColorInput = (
  initialColor: string,
  onPick: (value: string) => void
) => {
  if (typeof document === "undefined") {
    return;
  }

  const input = document.createElement("input");
  input.type = "color";
  input.value = initialColor;
  input.style.position = "fixed";
  input.style.left = "-9999px";
  input.style.opacity = "0";
  input.style.pointerEvents = "none";
  document.body.appendChild(input);

  const cleanup = () => {
    input.removeEventListener("change", handleChange);
    input.removeEventListener("blur", handleBlur);
    if (input.parentNode) {
      input.parentNode.removeChild(input);
    }
  };

  const handleChange = () => {
    onPick(input.value);
    cleanup();
  };

  const handleBlur = () => {
    cleanup();
  };

  input.addEventListener("change", handleChange, { once: true });
  input.addEventListener("blur", handleBlur, { once: true });
  input.click();
};

const applySelectionStyle = (
  api: InlineToolOptions["api"],
  range: Range,
  cssProperty: "color" | "backgroundColor",
  color: string
) => {
  if (range.collapsed) {
    return;
  }

  const selection = window.getSelection();
  if (!selection) {
    return;
  }

  selection.removeAllRanges();
  selection.addRange(range);

  const span = document.createElement("span");
  span.style[cssProperty] = color;
  span.appendChild(range.extractContents());
  range.insertNode(span);

  const nextRange = document.createRange();
  nextRange.selectNodeContents(span);
  selection.removeAllRanges();
  selection.addRange(nextRange);
  api.selection?.expandToTag?.(span);
};

const findStyledParentSpan = (
  selection: Selection,
  cssProperty: "color" | "backgroundColor"
) => {
  let node: Node | null = selection.anchorNode;
  while (node) {
    if (node instanceof HTMLElement && node.tagName === "SPAN" && node.style[cssProperty]) {
      return node;
    }
    node = node.parentNode;
  }
  return null;
};

const createInlineButton = (label: string, icon: string) => {
  const button = document.createElement("button");
  button.type = "button";
  button.classList.add("ce-inline-tool");
  button.title = label;
  button.innerHTML = icon;
  return button;
};

export class TextColorInlineTool {
  public static isInline = true;
  public static sanitize = {
    span: {
      style: true,
    },
  };

  private readonly api: InlineToolOptions["api"];
  private readonly defaultColor: string;
  private button: HTMLButtonElement | null = null;

  constructor({ api, config }: InlineToolOptions) {
    this.api = api;
    this.defaultColor = config?.defaultColor ?? "#2563eb";
  }

  render() {
    this.button = createInlineButton(
      "Text color",
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M6 20h12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M8 16l4-10 4 10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    );
    return this.button;
  }

  surround(range: Range) {
    const preservedRange = range.cloneRange();
    createHiddenColorInput(this.defaultColor, (pickedColor) => {
      applySelectionStyle(this.api, preservedRange, "color", pickedColor);
    });
  }

  checkState(selection: Selection) {
    const isActive = Boolean(findStyledParentSpan(selection, "color"));
    this.button?.classList.toggle("ce-inline-tool--active", isActive);
  }
}

export class BackgroundColorInlineTool {
  public static isInline = true;
  public static sanitize = {
    span: {
      style: true,
    },
  };

  private readonly api: InlineToolOptions["api"];
  private readonly defaultColor: string;
  private button: HTMLButtonElement | null = null;

  constructor({ api, config }: InlineToolOptions) {
    this.api = api;
    this.defaultColor = config?.defaultColor ?? "#fde68a";
  }

  render() {
    this.button = createInlineButton(
      "Background color",
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M5 19h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M8 14l4-8 4 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><rect x="7" y="16" width="10" height="3" rx="1.2" fill="currentColor"/></svg>'
    );
    return this.button;
  }

  surround(range: Range) {
    const preservedRange = range.cloneRange();
    createHiddenColorInput(this.defaultColor, (pickedColor) => {
      applySelectionStyle(this.api, preservedRange, "backgroundColor", pickedColor);
    });
  }

  checkState(selection: Selection) {
    const isActive = Boolean(findStyledParentSpan(selection, "backgroundColor"));
    this.button?.classList.toggle("ce-inline-tool--active", isActive);
  }
}
