const WRAPPED_HANDLER = Symbol.for('shramSangam.expressAsyncWrapped');

function isPromiseLike(value) {
  return Boolean(value) && typeof value.then === 'function';
}

function isExpressRouter(candidate) {
  return typeof candidate === 'function'
    && typeof candidate.handle === 'function'
    && typeof candidate.use === 'function'
    && Array.isArray(candidate.stack);
}

function wrapHandler(handler) {
  if (typeof handler !== 'function' || isExpressRouter(handler) || handler[WRAPPED_HANDLER]) {
    return handler;
  }

  if (handler.length === 4) {
    function wrappedErrorHandler(error, req, res, next) {
      try {
        const result = handler.call(this, error, req, res, next);
        if (isPromiseLike(result)) {
          result.catch(next);
        }
        return result;
      } catch (caughtError) {
        return next(caughtError);
      }
    }

    wrappedErrorHandler[WRAPPED_HANDLER] = true;
    return wrappedErrorHandler;
  }

  function wrappedHandler(req, res, next) {
    try {
      const result = handler.call(this, req, res, next);
      if (isPromiseLike(result)) {
        result.catch(next);
      }
      return result;
    } catch (caughtError) {
      return next(caughtError);
    }
  }

  wrappedHandler[WRAPPED_HANDLER] = true;
  return wrappedHandler;
}

function wrapArgs(args) {
  return args.map((arg) => {
    if (Array.isArray(arg)) {
      return arg.map((entry) => wrapHandler(entry));
    }
    return wrapHandler(arg);
  });
}

function patchMethod(target, methodName) {
  const original = target?.[methodName];
  if (typeof original !== 'function' || original[WRAPPED_HANDLER]) {
    return;
  }

  function patchedMethod(...args) {
    return original.apply(this, wrapArgs(args));
  }

  patchedMethod[WRAPPED_HANDLER] = true;
  target[methodName] = patchedMethod;
}

function patchExpressAsync(express) {
  const methods = ['use', 'all', 'get', 'post', 'put', 'patch', 'delete', 'options', 'head'];
  const routerPrototype = Object.getPrototypeOf(express.Router());
  const appPrototype = Object.getPrototypeOf(express());
  const routePrototype = Object.getPrototypeOf(express.Router().route('/__async_patch__'));

  for (const method of methods) {
    patchMethod(routerPrototype, method);
    patchMethod(appPrototype, method);
    patchMethod(routePrototype, method);
  }
}

module.exports = { patchExpressAsync };
