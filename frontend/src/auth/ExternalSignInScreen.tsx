import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const COPY = {
  proxy: {
    title: "Sign in through your proxy",
    body: "This server trusts the sign-in done by your reverse proxy, and this request didn't carry one. Open Notes Again through the proxy's address, sign in there, and try again.",
  },
  "cloudflare-access": {
    title: "Sign in with Cloudflare Access",
    body: "This server trusts Cloudflare Access, and this request didn't carry a valid Access sign-in. Open Notes Again through its Cloudflare address, sign in there, and try again.",
  },
} as const;

export default function ExternalSignInScreen({ mode }: { mode: keyof typeof COPY }) {
  const copy = COPY[mode];
  return (
    <div className="grid min-h-dvh place-items-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{copy.title}</CardTitle>
          <CardDescription>{copy.body}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => window.location.reload()}>Try again</Button>
        </CardContent>
      </Card>
    </div>
  );
}
