#include <node_api.h>
#import <Cocoa/Cocoa.h>

static napi_value fail(napi_env env, const char* msg) { napi_throw_error(env, nullptr, msg); return nullptr; }
static void number(napi_env env, napi_value object, const char* key, double value) { napi_value n; napi_create_double(env,value,&n); napi_set_named_property(env,object,key,n); }
static napi_value inspect(napi_env env, napi_callback_info info) {
  size_t argc=1; napi_value args[1]; napi_get_cb_info(env,info,&argc,args,nullptr,nullptr);
  if(argc!=1)return fail(env,"Expected Electron NSView buffer");
  void* bytes=nullptr;size_t length=0;if(napi_get_buffer_info(env,args[0],&bytes,&length)!=napi_ok||length<sizeof(void*))return fail(env,"Invalid native handle");
  NSView* view=(__bridge NSView*)(*(void**)bytes);if(!view||![view isKindOfClass:[NSView class]]||!view.window)return fail(env,"Native handle does not resolve to an NSView in a window");
  NSWindow* window=view.window;napi_value out;napi_create_object(env,&out);
  const struct { NSWindowButton type; const char* name; } buttons[]={{NSWindowCloseButton,"close"},{NSWindowMiniaturizeButton,"minimize"},{NSWindowZoomButton,"zoom"}};
  for(const auto& item:buttons){
    NSButton* button=[window standardWindowButton:item.type];if(!button||!button.superview||button.hiddenOrHasHiddenAncestor)return fail(env,"A native window button is unavailable");
    NSRect rect=[button.superview convertRect:button.frame toView:view];const NSRect bounds=view.bounds;
    napi_value result;napi_create_object(env,&result);number(env,result,"x",NSMinX(rect)-NSMinX(bounds));number(env,result,"y",view.isFlipped?NSMinY(rect)-NSMinY(bounds):NSMaxY(bounds)-NSMaxY(rect));number(env,result,"width",NSWidth(rect));number(env,result,"height",NSHeight(rect));napi_set_named_property(env,out,item.name,result);
  }
  number(env,out,"viewWidth",NSWidth(view.bounds));number(env,out,"viewHeight",NSHeight(view.bounds));return out;
}
static napi_value init(napi_env env,napi_value exports){napi_value f;napi_create_function(env,"inspect",NAPI_AUTO_LENGTH,inspect,nullptr,&f);napi_set_named_property(env,exports,"inspect",f);return exports;}
NAPI_MODULE(NODE_GYP_MODULE_NAME,init)
