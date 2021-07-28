export var config = {
    DEFAULT_WPS_MAIN_PUB: "graphql_main",
    DEFAULT_WPS_PUBSUB_PUB: "graphql_pubsub",
    DEFAULT_PUBSUB_ENGINE_HANDLER_URL: "/wps-services/pubsub",
    DEFAULT_WPS_MAIN_HANDLER_URL: "/wps-services/main",
    DEFAULT_WPS_HTTP_PORT: 8888,
    DEFAULT_SERVER_PORT: 4000,
    DEBUG: true,
};
 
export function log(...args: any){
	if (config.DEBUG)
		console.log(new Date(), ...args);	
}

// a method decorator
export function LOG(log_msg: string = "") {
	return function (target:any, propertyKey:any, descriptor: PropertyDescriptor) {
		var originalMethod = descriptor.value;
		log_msg = log_msg.length > 0 ? log_msg : propertyKey;
		// console.log(`functionName=${propertyKey}   desc=${JSON.stringify(descriptor)}  `);
		
		descriptor.value = function(...args: any[]) {
			log(`[begin] ${log_msg}`);
			log('args = ', args)
			let result = originalMethod.apply(this, args);
			log(`[ end ] ${log_msg}`);
			return result;
		};

		return descriptor;
	}
}


