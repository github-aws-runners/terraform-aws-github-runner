const FORWARD_SLASH = '/'.charCodeAt(0);

export function trimTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === FORWARD_SLASH) {
    end -= 1;
  }

  return end === value.length ? value : value.slice(0, end);
}

export function trimSurroundingSlashes(value: string): string {
  let start = 0;
  while (start < value.length && value.charCodeAt(start) === FORWARD_SLASH) {
    start += 1;
  }

  let end = value.length;
  while (end > start && value.charCodeAt(end - 1) === FORWARD_SLASH) {
    end -= 1;
  }

  return start === 0 && end === value.length ? value : value.slice(start, end);
}
