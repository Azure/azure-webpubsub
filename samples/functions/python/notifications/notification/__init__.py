import datetime
import random
import json

import azure.functions as func

def main(myTimer: func.TimerRequest, actions: func.Out[str]) -> None:
    time = datetime.datetime.now().strftime("%A %d-%b-%Y %H:%M:%S")
    actions.set(json.dumps({
        'actionName': 'sendToAll',
        'data': '\x5B DateTime: {0} \x5D Temperature: {1:.3f} \xB0C, Humidity: {2:.3f} \x25'.format(time, 22 + 2 * (random.random() - 0.5), 44 + 4 * (random.random() - 0.5)),
        'dataType': 'text'
    }))