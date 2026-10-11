// Phone-app alerts. Used only inside the Android app (Capacitor); browsers never load this file.
// It talks to the app's built-in Push Notifications plugin and hands core.js the phone's alert address.
(function () {
  "use strict";
  var cap = window.Capacitor;
  var push = cap && cap.Plugins && cap.Plugins.PushNotifications;
  if (!push) return;

  var CHANNEL = "koveli_alerts";
  var lastToken = "";

  function register() {
    return new Promise(function (resolve, reject) {
      var done = false, handles = [];
      function finish(fn, value) {
        if (done) return; done = true;
        handles.forEach(function (h) { Promise.resolve(h).then(function (x) { if (x && x.remove) x.remove(); }).catch(function () {}); });
        fn(value);
      }
      handles.push(push.addListener("registration", function (t) { lastToken = String((t && t.value) || ""); finish(resolve, lastToken); }));
      handles.push(push.addListener("registrationError", function (e) { finish(reject, new Error("The phone could not register for alerts. " + ((e && e.error) || ""))); }));
      setTimeout(function () { if (lastToken) finish(resolve, lastToken); else finish(reject, new Error("The phone took too long to register for alerts. Check the internet and try again.")); }, 20000);
      Promise.resolve(push.createChannel ? push.createChannel({ id: CHANNEL, name: "Koveli alerts", description: "Leave, duty change and roster messages", importance: 5, visibility: 1, vibration: true }) : null)
        .catch(function () {})
        .then(function () { return push.register(); })
        .catch(function (e) { finish(reject, e instanceof Error ? e : new Error(String(e))); });
    });
  }

  window.KoveliNativePush = {
    platform: (cap.getPlatform && cap.getPlatform()) || "android",
    checkPermissions: function () { return push.checkPermissions(); },
    requestPermissions: function () { return push.requestPermissions(); },
    register: register,
    onAction: function (handler) { push.addListener("pushNotificationActionPerformed", handler); }
  };
})();
