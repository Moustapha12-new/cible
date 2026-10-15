"use client";

import { useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";

export default function AdaptationRedirect() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const offer = searchParams.get("offer");

  useEffect(() => {
    const target = offer ? `/app/cv?offer=${encodeURIComponent(offer)}` : "/app/cv";
    router.replace(target);
  }, [offer, router]);

  return null;
}