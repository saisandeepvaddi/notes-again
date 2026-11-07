import { Input } from "@/components/ui/input";
import { getURL } from "@/utils/fetchers";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { buildConnectLink } from "./connectLink";

function defaultServer() {
  const api = getURL();
  return /^https?:\/\//.test(api) ? api.replace(/\/api$/, "") : window.location.origin;
}

interface ConnectQrCodeProps {
  token: string;
  server?: string;
  alt?: string | null;
}

export function ConnectQrCode({ token, server: fixedServer, alt }: ConnectQrCodeProps) {
  const [server, setServer] = useState(() => fixedServer ?? defaultServer());
  const [image, setImage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const link = buildConnectLink({ server: server.trim(), token, alt: alt ?? undefined });
    QRCode.toDataURL(link, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 440,
      color: { dark: "#000000", light: "#ffffff" },
    })
      .then((url) => !cancelled && setImage(url))
      .catch(() => !cancelled && setImage(null));
    return () => {
      cancelled = true;
    };
  }, [server, token, alt]);

  return (
    <div className="flex flex-col items-center gap-3 rounded-lg bg-muted/50 p-4 sm:flex-row sm:items-start">
      <div className="size-44 shrink-0 overflow-hidden rounded-md bg-white p-1 ring-1 ring-foreground/10">
        {image ? (
          <img src={image} alt="QR code to connect the mobile app" className="size-full" />
        ) : null}
      </div>
      <div className="grid w-full gap-2 text-xs">
        <p className="font-medium">Scan with the mobile app</p>
        <p className="text-muted-foreground">
          On the phone, open Notes Again and tap Scan QR code. The code holds this{" "}
          {fixedServer ? "computer" : "server"}'s address and the token, so treat it like a
          password.
        </p>
        {fixedServer ? (
          <p className="text-muted-foreground">
            The phone connects to <code className="font-mono">{fixedServer}</code>
            {alt ? (
              <>
                {" "}
                (or <code className="font-mono">{alt}</code> if that address changes)
              </>
            ) : null}
            .
          </p>
        ) : (
          <>
            <label className="grid gap-1.5 font-medium">
              Server address the phone uses
              <Input
                value={server}
                onChange={(event) => setServer(event.target.value)}
                spellCheck={false}
                autoCapitalize="off"
              />
            </label>
            <p className="text-muted-foreground">
              Change it if the phone reaches this server another way, like a LAN or Tailscale
              address.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
