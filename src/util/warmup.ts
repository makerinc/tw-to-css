import { TailwindConfig } from "tailwindcss/tailwindconfig.faketype";
import { formatCSS } from "./format-css";
import { cssToJson } from "./css-to-json";
import { processTailwindCSS } from "./process-tailwind-css";
import postcss from "postcss";

export interface WarmupOptions {
  merge?: boolean;
  minify?: boolean; 
  ignoreMediaQueries?: boolean;
}

export function warmupClasses(
  warmupString: string,
  config: TailwindConfig | undefined,
  options: WarmupOptions | undefined,
  getCSS: (content: string, config?: TailwindConfig) => string,
  cssCache: Map<string, string>,
  jsonCache: Map<string, object>
): void {
  if (!warmupString || typeof warmupString !== 'string') {
    console.warn('[warmup] Invalid warmup string provided');
    return;
  }
  
  const classes = warmupString
    .split(/\s+/)
    .filter(cls => cls.trim().length > 0)
    .filter(cls => /^[a-zA-Z0-9_-]+$/.test(cls));
  
  if (classes.length === 0) {
    console.warn('[warmup] No valid classes found in warmup string');
    return;
  }
  
  try {
    const allClassesString = classes.join(' ');
    const rawCSS = processTailwindCSS({ config, content: allClassesString });
    
    if (!rawCSS || typeof rawCSS !== 'string') {
      console.error('[warmup] Failed to generate CSS from TailwindCSS');
      return;
    }
    
    const classToPropsMap = parseRawCSSToClassMap(rawCSS, classes);
    
    populateCache(classes, classToPropsMap, config, options, cssCache, jsonCache);
    
  } catch (error) {
    console.error('[warmup] Error during warmup process:', error);
  }
}

function parseRawCSSToClassMap(rawCSS: string, targetClasses: string[]): Map<string, Record<string, string>> {
  const classToPropsMap = new Map<string, Record<string, string>>();
  
  if (!rawCSS || !targetClasses || targetClasses.length === 0) {
    return classToPropsMap;
  }
  
  try {
    const root = postcss.parse(rawCSS);
    
    root.walkRules((rule) => {
      try {
        const selector = rule.selector;
        
        // Only process single class selectors (e.g., ".relative", ".hover\:bg-blue-600:hover")
        // Exclude media queries and complex selectors but allow pseudo-selectors
        if (selector.startsWith('.') && 
            !selector.includes(' ') && 
            !selector.includes('[') &&
            !selector.includes('>')) {
          
          let className = selector.substring(1);
          className = className.replace(/:[a-z-]+$/g, '');
          className = className.replace(/\\(.)/g, '$1');
          
          if (targetClasses.includes(className)) {
            const properties: Record<string, string> = {};
            
            rule.walkDecls((decl) => {
              try {
                const camelCaseProp = decl.prop.replace(/-([a-z])/g, (_, letter) => 
                  letter.toUpperCase()
                );
                properties[camelCaseProp] = decl.value;
              } catch (declError) {
                console.warn(`[warmup] Error processing declaration in ${className}:`, declError);
              }
            });
            
            if (Object.keys(properties).length > 0) {
              classToPropsMap.set(className, properties);
            }
          }
        }
      } catch (ruleError) {
        console.warn('[warmup] Error processing CSS rule:', ruleError);
      }
    });
  } catch (error) {
    console.error('[warmup] Error parsing CSS:', error);
  }
  
  return classToPropsMap;
}

function populateCache(
  classes: string[],
  classToPropsMap: Map<string, Record<string, string>>,
  config: TailwindConfig | undefined,
  options: WarmupOptions | undefined,
  cssCache: Map<string, string>,
  jsonCache: Map<string, object>
): void {
  classes.forEach((className) => {
    const jsonResult = classToPropsMap.get(className) || {};
    
    const cssProperties = Object.entries(jsonResult)
      .map(([prop, value]) => {
        const kebabProp = prop.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`);
        return `${kebabProp}:${value}`;
      })
      .join(';');
    
    const cssResult = cssProperties + (cssProperties ? ';' : '');
    
    const cacheKey = JSON.stringify({ 
      content: className, 
      config, 
      mainOptions: options, 
      options: undefined 
    });
    
    cssCache.set(cacheKey, cssResult);
    jsonCache.set(cacheKey, jsonResult);
  });
}