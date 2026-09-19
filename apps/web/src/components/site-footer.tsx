import { Mail, MapPin, Phone } from "lucide-react";
import Link from "next/link";

export const lodge = {
  address: "Vumba Mountains, Mutare, Zimbabwe",
  phone: "+263 71 234 5678",
  email: "reservations@forestcreeklodge.co.zw",
};

export default function SiteFooter() {
  return (
    <footer className="border-t border-border/60 bg-popover">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <img
            src="/brand-icon.png"
            alt=""
            className="mb-4 h-12 w-12 rounded-2xl object-cover ring-1 ring-accent/30"
          />
          <h2 className="font-display text-2xl">Visit Us</h2>
          <ul className="mt-5 space-y-3 text-sm text-muted-foreground">
            <li className="flex items-start gap-3">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              <span>{lodge.address}</span>
            </li>
            <li className="flex items-start gap-3">
              <Phone className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              <a href={`tel:${lodge.phone.replace(/\s/g, "")}`} className="hover:text-accent">
                {lodge.phone}
              </a>
            </li>
            <li className="flex items-start gap-3">
              <Mail className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              <a href={`mailto:${lodge.email}`} className="break-all hover:text-accent">
                {lodge.email}
              </a>
            </li>
          </ul>
        </div>

        <div>
          <h2 className="font-display text-2xl">Follow the Forest</h2>
          <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
            An eco-conscious retreat in the Vumba highlands — every stay planted lightly among the
            trees.
          </p>
        </div>

        <div>
          <h2 className="font-display text-2xl">Plan Your Stay</h2>
          <ul className="mt-5 space-y-3 text-sm text-muted-foreground">
            <li>
              <Link href="/book" className="hover:text-accent">
                Book a stay
              </Link>
            </li>
            <li>
              <a href="/places" className="hover:text-accent">
                Our places
              </a>
            </li>
            <li>
              <a href="/#story" className="hover:text-accent">
                Our story
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-border/60 px-5 py-6 text-center text-xs text-muted-foreground">
        <p>Managed with care by Thembie &amp; Michaels</p>
        <p className="mt-1">
          &copy; {new Date().getFullYear()} Forest Creek Lodge, Vumba. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
