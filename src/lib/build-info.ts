/**
 * Release identifier, attached to every error and RUM report and shown in the
 * footer. CI sets NEXT_PUBLIC_BUILD_ID to the commit sha; locally it is "dev".
 */
export const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";
