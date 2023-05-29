# pcf-web-pubsub-sample

## Steps

1. Check [Create your first component](https://learn.microsoft.com/power-apps/developer/component-framework/implementing-controls-using-typescript?tabs=before) to set up the environment and run the app locally.

2. Update the [`local.settings.sample.json`](/Functions/negotiate/local.settings.sample.json#L5) under project __Functions__ to set the Web PubSub connection string. Replace the placeholder `<webpubsub-connection-string>` with your resource value.

3. Rename the sample setting file to `local.settings.json`.

4. Run `npm install` under project __Functions__ to install functions required dependent packages.
   
5. Run `func start` under project __Functions__ to start the function app which helps negotiate and build the web pubsub websocket url.

6. Run `npm start watch` under project __PowerAppLinerInput__ to start the power app.

> Update the switch value in file [`PowerAppLinerInput\LinerInputControl\index.ts`](/PowerAppLinerInput/LinearInputControl/index.ts#L42) to turn on/off the Web PubSub connection. 
> - When the value is `true` which means Web PubSub is on to get real-time data, you'll be able to see the instant updates in 2 different local app windows. See snapshot.
> - When the value is `false` without Web PubSub, you have to refresh page in another window to get the latest value. 

![snapshot](realtime-updates.gif)