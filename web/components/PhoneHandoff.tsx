"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";

/**
 * Whether this device has its own fingerprint / Face ID / Windows Hello. When it doesn't (e.g. most Linux
 * desktops), the browser falls back to "scan a QR with your phone", which relies on a Bluetooth hand-off
 * between the two devices that some desktop browsers can't complete.
 */
export function usePlatformAuthenticator() {
  const [available, setAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    const check =
      typeof PublicKeyCredential !== "undefined" && PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable
        ? PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
        : Promise.resolve(false);
    check.then((v) => live && setAvailable(v)).catch(() => live && setAvailable(false));
    return () => {
      live = false;
    };
  }, []);
  return available;
}

/** QR that opens this page on the user's phone, so the passkey is created natively there — no Bluetooth needed. */
export function PhoneHandoff({ reason }: { reason: "no-biometrics" | "failed" }) {
  const [svg, setSvg] = useState<string>();
  useEffect(() => {
    let live = true;
    QRCode.toString(window.location.href, { type: "svg", margin: 1, errorCorrectionLevel: "M" })
      .then((s) => live && setSvg(s))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  return (
    <div className="space-y-3 border border-line p-3 text-sm">
      <p className="font-bold">Continue on your phone</p>
      <p className="text-muted">
        {reason === "no-biometrics"
          ? "This computer has no fingerprint or Face ID, so it would need to borrow your phone over Bluetooth — which often fails on Linux and in Brave."
          : "Your phone didn't finish connecting to this computer (that hand-off needs Bluetooth on both devices)."}{" "}
        Scan this code with your phone&apos;s camera to play there with its own Face ID or fingerprint.
      </p>
      {svg ? (
        <div className="mx-auto w-40 bg-white p-2" dangerouslySetInnerHTML={{ __html: svg }} aria-label="QR code" />
      ) : (
        <div className="mx-auto h-40 w-40 animate-pulse bg-surface-2" />
      )}
    </div>
  );
}
