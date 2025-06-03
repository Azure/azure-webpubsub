import random
import azure.functions as func
from azure.functions.decorators.core import DataType
import json

app = func.FunctionApp()
current_index= 14000

@app.timer_trigger(schedule="* * * * * *", arg_name="myTimer", run_on_startup=False,
              use_monitor=False)
@app.generic_output_binding("sio", type="socketio", data_type=DataType.STRING, hub="hub")
def publish_data(myTimer: func.TimerRequest,
                 sio: func.Out[str]) -> None:
    change = round(random.uniform(-10, 10), 2)
    global current_index
    current_index = current_index + change
    sio.set(json.dumps({
        'actionName': 'sendToNamespace',
        'namespace': '/',
        'eventName': 'update',
        'parameters': [
            current_index
        ]
    }))

@app.function_name(name="negotiate")
@app.route(auth_level=func.AuthLevel.ANONYMOUS)
@app.generic_input_binding("negotiationResult", type="socketionegotiation", hub="hub")
def negotiate(req: func.HttpRequest, negotiationResult) -> func.HttpResponse:
    return func.HttpResponse(negotiationResult)

@app.function_name(name="index")
@app.route(auth_level=func.AuthLevel.ANONYMOUS)
def index(req: func.HttpRequest) -> func.HttpResponse:
    path = './index.html'
    with open(path, 'rb') as f:
        return func.HttpResponse(f.read(), mimetype='text/html')
