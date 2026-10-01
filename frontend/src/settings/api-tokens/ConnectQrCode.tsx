import { Input } from "@/components/ui/input";
import { getURL } from "@/utils/fetchers";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { buildConnectLink } from "./connectLink";

function defaultServer() {
  const api = getURL();
  return /^https?:\/\//.test(api) ? api.replace(/\/api$/, "") : window.location.origin;
}

export function ConnectQrCode({ token }: { token: string }) {
  const [server, setServer] = useState(defaultServer);
  const [image, setImage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(buildConnectLink({ server: server.trim(), token }), {
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
  }, [server, token]);

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
          On the phone, open Notes Again and tap Scan QR code. The code holds this server's address
          and the token, so treat it like a password.
        </p>
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
          Change it if the phone reaches this server another way, like a LAN or Tailscale address.
        </p>
      </div>
    </div>
  );
}
