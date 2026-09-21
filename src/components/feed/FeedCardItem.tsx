import { CreatorCard } from "./CreatorCard";
import { ProductCard } from "./ProductCard";
import { PromoCard } from "./PromoCard";
import { StoryCard } from "./StoryCard";
import type { FeedCard } from "@/domain/api";
import type { Translator } from "@/i18n/translate";

/**
 * Renders one heterogeneous feed entry.
 *
 * No "use client" directive: the server renders the first page with it, and the
 * client-side "load more" imports the same component for later pages. One
 * implementation, two rendering environments — which is why `t` arrives as a prop
 * instead of being read from a hook.
 */
export function FeedCardItem({
  card,
  t,
  priority = false,
}: {
  card: FeedCard;
  t: Translator;
  priority?: boolean;
}) {
  switch (card.type) {
    case "product":
      return <ProductCard card={card.product} t={t} priority={priority} reason={card.reason} />;
    case "story":
      return (
        <StoryCard
          story={card.story}
          creator={card.creator}
          products={card.products}
          t={t}
          priority={priority}
        />
      );
    case "creator":
      return <CreatorCard creator={card.creator} sampleProducts={card.sampleProducts} />;
    case "promo":
      return (
        <PromoCard
          title={card.title}
          imageUrl={card.imageUrl}
          deeplink={card.deeplink}
          endsAt={card.endsAt}
          t={t}
        />
      );
  }
}
