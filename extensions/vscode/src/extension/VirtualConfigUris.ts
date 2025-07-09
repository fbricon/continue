import { isSupportedSlug } from "core/config/yaml/VirtualConfigYamlSupport";

export const GRANITE_CODE_CONFIG_SCHEME = "granitecode-config";

export async function getVirtualConfigUri(
  slug: string,
): Promise<string | undefined> {
  if (!isSupportedSlug(slug)) {
    return undefined;
  }
  return `${GRANITE_CODE_CONFIG_SCHEME}:${encodeURIComponent(`${slug}.yaml`)}`;
}
