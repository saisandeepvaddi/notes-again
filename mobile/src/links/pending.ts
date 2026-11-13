let pending: { title: string; uid: string } | null = null;

export const setPendingLink = (link: { title: string; uid: string }) => {
  pending = link;
};

export function takePendingLink() {
  const link = pending;
  pending = null;
  return link;
}
