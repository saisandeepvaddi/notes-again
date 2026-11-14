import { PageHeader } from "@/components/PageHeader";
import { ChatPage } from "@/chat/ChatPage";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/chat")({
  head: () => ({ meta: [{ title: "Chat · Notes Again" }] }),
  component: Chat,
});

function Chat() {
  return (
    <div>
      <PageHeader title="Chat" />
      <ChatPage />
    </div>
  );
}
