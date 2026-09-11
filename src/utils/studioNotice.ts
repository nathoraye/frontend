export type NoticeTone = 'error' | 'warning' | 'info' | 'success';

export type StudioNotice = {
  id: number;
  tone: NoticeTone;
  title: string;
  detail?: string;
};

type Listener = (notices: StudioNotice[]) => void;

const MAX_NOTICES = 3;
const listeners = new Set<Listener>();
let notices: StudioNotice[] = [];
let nextId = 1;

function emit(): void {
  const snapshot = notices.slice();
  listeners.forEach((fn) => fn(snapshot));
}

export function notifyStudio(input: { tone: NoticeTone; title: string; detail?: string }): StudioNotice {
  const notice: StudioNotice = {
    id: nextId++,
    tone: input.tone,
    title: input.title,
    detail: input.detail,
  };
  notices = [...notices, notice].slice(-MAX_NOTICES);
  emit();
  return notice;
}

export function dismissStudioNotice(id: number): void {
  notices = notices.filter((n) => n.id !== id);
  emit();
}

export function subscribeStudioNotices(listener: Listener): () => void {
  listeners.add(listener);
  listener(notices.slice());
  return () => {
    listeners.delete(listener);
  };
}

/** Test helper — not used by the app. */
export function resetStudioNotices(): void {
  notices = [];
  emit();
}
