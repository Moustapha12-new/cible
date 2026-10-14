import { LanguageProvider } from "@/lib/i18n";
import Preloader from "@/components/Preloader";
import SmoothScroll from "@/components/SmoothScroll";
import Cursor from "@/components/Cursor";
import Nav from "@/components/Nav";
import Hero from "@/components/Hero";
import Proof from "@/components/Proof";
import Features from "@/components/Features";
import HowItWorks from "@/components/HowItWorks";
import DemoSection from "@/components/DemoSection";
import Autopilot from "@/components/Autopilot";
import Testimonials from "@/components/Testimonials";
import Faq from "@/components/Faq";
import FinalCta from "@/components/FinalCta";
import Footer from "@/components/Footer";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { REFRESH_COOKIE } from "@/lib/auth-server";

export default async function Home() {
  if ((await cookies()).get(REFRESH_COOKIE)?.value) redirect("/connexion?next=/app/offres");
  return (
    <LanguageProvider>
      <SmoothScroll />
      <Preloader />
      <Cursor />
      <Nav />
      <main className="flex-1">
        <Hero />
        <Proof />
        <Features />
        <HowItWorks />
        <DemoSection />
        <Autopilot />
        <Testimonials />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </LanguageProvider>
  );
}
