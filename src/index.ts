import types from "..";
import { processTailwindCSS, formatCSS, warmupClasses } from "./util";
import { cssToJson } from "./util/css-to-json";

const getCSS: typeof types.getCSS = (content, config) => {
  const preflight = ((config?.corePlugins as any)?.preflight as boolean) ?? false;
  const corePlugins = (config?.corePlugins as {}) || {};

  return processTailwindCSS({
    config: {
      ...config,
      corePlugins: {
        ...corePlugins,
        preflight,
      },
    },
    content,
  });
};

const tailwindToCSS: typeof types.tailwindToCSS = ({ config, options, warmup }) => {
  const cssCache = new Map<string, string>();
  const jsonCache = new Map<string, object>();
  
  if (warmup) {
    warmupClasses(warmup, config, options, getCSS, cssCache, jsonCache);
  }
  
  return {
    twi: tailwindInlineCSSWithCache(config, options, cssCache),
    twj: tailwindInlineJsonWithCache(config, options, jsonCache),
  };
};

const classListFormatter: typeof types.classListFormatter = (...params) => {
  let classList = "";

  if (typeof params[0] === "string") {
    classList = params[0];
  } else if (Array.isArray(params[0])) {
    classList = (params as any[])
      .flat(Infinity)
      .map((styles) => classListFormatter(styles))
      .join(" ");
  } else if (typeof params[0] === "object") {
    classList = Object.entries(params[0])
      .filter((entry) => !!entry[1])
      .map((entry) => entry[0])
      .join(" ");
  }

  classList = classList.replace(/\s+/g, " ");

  return classList;
};

const tailwindInlineCSSWithCache =
  (config, mainOptions, cache: Map<string, string>) =>
  (...params: any) => {
    const content = classListFormatter(params);
    const { 1: options } = params || {};

    const cacheKey = JSON.stringify({ content, config, mainOptions, options });
    
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey)!;
    }

    const defaultOptions = { merge: true, minify: true, ignoreMediaQueries: true };
    const twiOptions = { ...defaultOptions, ...mainOptions, ...options };

    const css = getCSS(content, config);
    const formattedCSS = formatCSS(css);

    if (twiOptions?.ignoreMediaQueries) {
      formattedCSS.removeMediaQueries();
    } else {
      formattedCSS.removeUndefined();
      formattedCSS.combineMediaQueries();
    }

    formattedCSS.fixRGB();

    if (twiOptions?.merge) formattedCSS.merge();
    if (twiOptions?.minify) formattedCSS.minify();

    const result = formattedCSS.get();
    
    cache.set(cacheKey, result);
    return result;
  };

const tailwindInlineJsonWithCache =
  (config, mainOptions, cache: Map<string, object>) =>
  (...params: any) => {
    const content = classListFormatter(params);
    const { 1: options } = params || {};

    const cacheKey = JSON.stringify({ content, config, mainOptions, options });
    
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey)!;
    }

    const cssCache = new Map<string, string>();
    const cssResult = tailwindInlineCSSWithCache(config, mainOptions, cssCache)(...params);
    
    const result = cssToJson(cssResult);
    
    cache.set(cacheKey, result);
    return result;
  };

const tailwindInlineCSS: typeof types.tailwindInlineCSS =
  (config, mainOptions) =>
  (...params: any) => {
    const cache = new Map<string, string>();
    return tailwindInlineCSSWithCache(config, mainOptions, cache)(...params);
  };

const tailwindInlineJson: typeof types.tailwindInlineJson =
  (config, mainOptions) =>
  (...params: any) => {
    const cache = new Map<string, object>();
    return tailwindInlineJsonWithCache(config, mainOptions, cache)(...params);
  };

const twi: typeof types.twi = tailwindInlineCSS();
const twj: typeof types.twj = tailwindInlineJson();

const twToCSS = tailwindToCSS;

export { twi, twj, tailwindToCSS, twToCSS };
