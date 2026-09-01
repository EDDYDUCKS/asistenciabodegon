import sys

class DebugLoggingMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        print(f"[DEBUG_REQUEST] Path: {request.path} | Method: {request.method} | Host: {request.META.get('HTTP_HOST')} | X-Forwarded-Proto: {request.META.get('HTTP_X_FORWARDED_PROTO')}", file=sys.stderr, flush=True)
        try:
            response = self.get_response(request)
            print(f"[DEBUG_RESPONSE] Status: {response.status_code}", file=sys.stderr, flush=True)
            return response
        except Exception as e:
            print(f"[DEBUG_EXCEPTION] {e}", file=sys.stderr, flush=True)
            raise
