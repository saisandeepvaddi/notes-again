import { useEffect } from "react";

const APP_NAME = "Notes Again";

export function useDocumentTitle(title: string | undefined) {
  useEffect(() => {
    const previous = document.title;
    document.title = title ? `${title} · ${APP_NAME}` : APP_NAME;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
