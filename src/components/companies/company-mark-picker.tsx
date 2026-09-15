"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Link2, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { clearCompanyLogo, refreshCompanyLogo, setCompanyLogo } from "@/app/companies/actions";

/** What the stored image is shrunk to. Twice the biggest box that draws it. */
const MAX_EDGE = 256;

/**
 * Saying which image a company should wear.
 *
 * The sweep reads a site's <head> and guesses, and it is sometimes
 * confidently wrong — Liddell's favicon is the WordPress logo, which the
 * fetcher stored without complaint. A wrong mark is worse than none, because
 * it looks like somebody chose it. This is how a person overrules the guess.
 *
 * Two ways in, because the right image is in one of two places: already on
 * your phone, or already on their website.
 */
export function CompanyMarkPicker({
  companyId,
  hasLogo,
}: {
  companyId: string;
  hasLogo: boolean;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [showUrl, setShowUrl] = useState(false);
  const [url, setUrl] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  /**
   * Shrunk here rather than on the server.
   *
   * A logo off a website is often two thousand pixels wide and far past what
   * the database will hold, and the browser already has a decoder and a
   * canvas. Drawing it down to 256px costs nothing on the phone, means the
   * upload is a few kilobytes instead of a megabyte, and turns whatever was
   * picked — JPEG, WEBP, an SVG — into one predictable PNG.
   *
   * The server checks the result anyway. Bytes shaped by code on somebody's
   * phone get the same treatment as bytes off a stranger's server.
   */
  async function shrink(file: File): Promise<string> {
    const objectUrl = URL.createObjectURL(file);
    try {
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("not an image"));
        image.src = objectUrl;
      });

      const scale = Math.min(1, MAX_EDGE / Math.max(image.width, image.height));
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("no canvas");
      context.drawImage(image, 0, 0, width, height);
      return canvas.toDataURL("image/png");
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  function save(source: string) {
    startTransition(async () => {
      const result = await setCompanyLogo(companyId, source);
      if (!result.ok) {
        showToast({ message: result.error });
        return;
      }
      setShowUrl(false);
      setUrl("");
      router.refresh();
      showToast({ message: "Icon updated" });
    });
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    try {
      save(await shrink(file));
    } catch {
      showToast({ message: "Couldn't read that file. A PNG or a JPEG works best." });
    }
  }

  /*
    The sweep again, for this company alone and even though it already has a
    mark. The sweep skips anybody who has one, which is right when it is
    working through thirty of them and wrong when you are looking at the one
    that came out blurred — DHL's is a 16-pixel tab icon blown up to 44.
  */
  function tryAgain() {
    startTransition(async () => {
      const result = await refreshCompanyLogo(companyId);
      router.refresh();
      showToast({
        message:
          result.ok && result.found
            ? "Found a new icon"
            : "Their site still offers nothing better",
      });
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await clearCompanyLogo(companyId);
      if (!result.ok) {
        showToast({ message: result.error });
        return;
      }
      router.refresh();
      showToast({ message: "Icon removed" });
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            void onFile(event.target.files?.[0]);
            /* Cleared so picking the same file twice still fires a change. */
            event.target.value = "";
          }}
        />
        <Button
          variant="secondary"
          size="md"
          className="w-auto"
          disabled={isPending}
          onClick={() => fileRef.current?.click()}
        >
          <ImagePlus aria-hidden className="size-5" strokeWidth={1.75} />
          {hasLogo ? "Replace icon" : "Use an image"}
        </Button>

        <Button
          variant="ghost"
          size="md"
          className="w-auto"
          disabled={isPending}
          onClick={() => setShowUrl((open) => !open)}
        >
          <Link2 aria-hidden className="size-5" strokeWidth={1.75} />
          From a link
        </Button>

        {hasLogo && (
          <Button variant="ghost" size="md" className="w-auto" disabled={isPending} onClick={tryAgain}>
            <RefreshCw aria-hidden className="size-5" strokeWidth={1.75} />
            Fetch again
          </Button>
        )}

        {hasLogo && (
          <Button variant="ghost" size="md" className="w-auto" disabled={isPending} onClick={remove}>
            <X aria-hidden className="size-5" strokeWidth={1.75} />
            Remove
          </Button>
        )}
      </div>

      {showUrl && (
        <div className="flex flex-col gap-2">
          <Input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://theirsite.com/logo.png"
            inputMode="url"
            autoComplete="off"
            aria-label="Image address"
          />
          <p className="text-timestamp text-sub text-pretty">
            On their website, press and hold the logo and copy the image address.
          </p>
          <Button
            size="md"
            className="w-auto self-start"
            disabled={isPending || !url.trim()}
            onClick={() => save(url.trim())}
          >
            Use this image
          </Button>
        </div>
      )}
    </div>
  );
}
