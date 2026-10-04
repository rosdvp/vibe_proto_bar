// Value snapshots have no DOM ancestors, so unchanged nodes cannot retain old
// detached application trees. Frame updates remain independent of these values.
interface RenderSnapshot {
  markup: string;
  styles: Map<string, { value: string; priority: string }>;
}
const snapshots = new WeakMap<Node, RenderSnapshot>();

function markup(node: Node): string {
  return node instanceof Element ? node.outerHTML : node.nodeValue ?? "";
}

function snapshot(node: Node): RenderSnapshot {
  const styles = new Map<string, { value: string; priority: string }>();
  if (node instanceof HTMLElement || node instanceof SVGElement) {
    for (const name of Array.from(node.style)) {
      styles.set(name, { value: node.style.getPropertyValue(name), priority: node.style.getPropertyPriority(name) });
    }
  }
  return { markup: markup(node), styles };
}

export function setStyle(element: HTMLElement | SVGElement, name: string, value: string): void {
  if (element.style.getPropertyValue(name) !== value) element.style.setProperty(name, value);
}

function explicitKey(node: Node): string | null {
  if (!(node instanceof Element)) return null;
  for (const attribute of ["data-render-key", "data-person-id", "data-cell-id", "data-research-id", "id"]) {
    const value = node.getAttribute(attribute);
    if (value !== null) return `${attribute}:${value}`;
  }
  return null;
}

function siblingKeys(nodes: Node[]): Map<Node, string | null> {
  const classes = nodes.map((node) => node instanceof Element ? node.classList.item(0) : null);
  return new Map(nodes.map((node, index) => {
    const className = classes[index];
    const uniqueClass = className && classes.indexOf(className) === classes.lastIndexOf(className);
    return [node, explicitKey(node) ?? (uniqueClass ? `class:${className}` : null)];
  }));
}

function compatible(current: Node, next: Node): boolean {
  return current.nodeType === next.nodeType && (!(current instanceof Element) ||
    next instanceof Element && current.localName === next.localName && current.namespaceURI === next.namespaceURI);
}

function remember(current: Node, next: Node): void {
  snapshots.set(current, snapshot(next));
  Array.from(current.childNodes).forEach((child, index) => remember(child, next.childNodes[index]!));
}

function patchNode(current: Node, next: Node): void {
  const previous = snapshots.get(current);
  if (previous?.markup === markup(next)) return;
  if (current instanceof Element && next instanceof Element) {
    for (const attribute of Array.from(current.attributes)) {
      if (!next.hasAttribute(attribute.name)) current.removeAttribute(attribute.name);
    }
    for (const attribute of Array.from(next.attributes)) {
      if (attribute.name === "style" && (current instanceof HTMLElement || current instanceof SVGElement) &&
        (next instanceof HTMLElement || next instanceof SVGElement)) {
        // Compare individual properties, preserving values managed by the frame loop
        // when their declarative value has not changed.
        for (const name of Array.from(current.style)) {
          if (!next.style.getPropertyValue(name)) current.style.removeProperty(name);
        }
        for (const name of Array.from(next.style)) {
          const oldStyle = previous?.styles.get(name);
          if (!oldStyle || oldStyle.value !== next.style.getPropertyValue(name) ||
            oldStyle.priority !== next.style.getPropertyPriority(name)) {
            if (current.style.getPropertyValue(name) !== next.style.getPropertyValue(name) ||
              current.style.getPropertyPriority(name) !== next.style.getPropertyPriority(name)) {
              current.style.setProperty(name, next.style.getPropertyValue(name), next.style.getPropertyPriority(name));
            }
          }
        }
      } else if (current.getAttribute(attribute.name) !== attribute.value) {
        current.setAttribute(attribute.name, attribute.value);
      }
    }
    patchChildren(current, next);
  } else if (current.nodeValue !== next.nodeValue) {
    current.nodeValue = next.nodeValue;
  }
  snapshots.set(current, snapshot(next));
}

function patchChildren(parent: Node, next: Node): void {
  const currentChildren = Array.from(parent.childNodes);
  const nextChildren = Array.from(next.childNodes);
  const currentKeys = siblingKeys(currentChildren);
  const nextKeys = siblingKeys(nextChildren);
  const used = new Set<Node>();
  let cursor = parent.firstChild;
  for (const child of nextChildren) {
    const key = nextKeys.get(child);
    let current: Node | undefined = currentChildren.find((candidate) => !used.has(candidate) &&
      currentKeys.get(candidate) === key && compatible(candidate, child));
    if (!current) {
      current = child.cloneNode(true);
      remember(current, child);
    } else {
      patchNode(current, child);
    }
    if (current !== cursor) parent.insertBefore(current, cursor);
    used.add(current);
    cursor = current.nextSibling;
  }
  for (const child of currentChildren) if (!used.has(child)) parent.removeChild(child);
}

/** Preserve live nodes (including images, scroll positions and CSS animations). */
export function patchHtml(parent: HTMLElement, html: string): void {
  const template = document.createElement("template");
  template.innerHTML = html;
  patchChildren(parent, template.content);
}
