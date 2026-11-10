export interface NavItemCandidate {
  href: string;
  label?: string;
}

/**
 * Computes the single active item href using a deterministic longest-matching-route algorithm.
 * Guarantees that EXACTLY ONE item is ever active in the navigation menu across the whole app.
 */
export function getActiveNavItemHref(
  pathname: string | null | undefined,
  allLinks: NavItemCandidate[]
): string | null {
  if (!pathname || !allLinks || allLinks.length === 0) return null;

  const cleanPath = pathname.split("?")[0].replace(/\/+$/, "") || "/";

  // Alias maps for routes that share equivalent destinations
  const aliases: Record<string, string[]> = {
    "/admin/buses": ["/dashboard/admin/transport"],
    "/staff/my-bus": ["/dashboard/teacher/transport"],
    "/parent/bus": ["/dashboard/parent/transport"],
    "/dashboard/teacher/assignments": ["/dashboard/teacher/homework"],
    "/dashboard/teacher/homework": ["/dashboard/teacher/assignments"],
    "/dashboard/parent/assignments": ["/dashboard/parent/homework"],
    "/dashboard/parent/homework": ["/dashboard/parent/assignments"],
    "/dashboard/admin/birthdays": ["/dashboard/admin/settings/birthdays"],
    "/dashboard/admin/settings/birthdays": ["/dashboard/admin/birthdays"],
  };

  let bestHref: string | null = null;
  let highestScore = -1;

  for (const link of allLinks) {
    const rawHref = link.href.split("?")[0].replace(/\/+$/, "") || "/";
    let score = -1;

    // 1. Exact match (highest priority)
    if (cleanPath === rawHref) {
      score = rawHref.length + 10000;
    }
    // 2. Direct alias exact match
    else if (aliases[rawHref]?.includes(cleanPath)) {
      score = rawHref.length + 5000;
    }
    // 3. Child route match (only for specific non-root paths)
    else if (
      rawHref !== "/dashboard" &&
      rawHref !== "/dashboard/admin" &&
      rawHref !== "/dashboard/teacher" &&
      rawHref !== "/dashboard/parent" &&
      rawHref !== "/" &&
      cleanPath.startsWith(rawHref + "/")
    ) {
      score = rawHref.length;
    }
    // 4. Alias child route match
    else if (aliases[rawHref]?.some((a) => cleanPath.startsWith(a + "/"))) {
      score = rawHref.length;
    }

    if (score > highestScore) {
      highestScore = score;
      bestHref = link.href;
    }
  }

  return bestHref;
}
