import asyncio
import sys
import websockets
import asyncio
import threading
import queue
from groups import WebPubSubGroup


def prompt():
    return "Enter a message to send or 'x' to terminate: "


def handle_message(user, msg):
    print("")
    print(f">>> Message received {user} : {msg}")
    print(prompt())


def add_input(input_queue):
    while True:
        msg = input(prompt())
        input_queue.put(msg)


async def read_input(bus):
    # console input has to be in a separate thread otherwise it somehow
    # blocks all asyncio, including the bus.listen and bus.consume tasks.
    input_queue = queue.Queue()
    input_thread = threading.Thread(target=add_input, daemon=True, args=(input_queue,))
    input_thread.start()
    while True:
        if not input_queue.empty():
            msg = input_queue.get()
            if msg == 'x':
                bus.close()
                break
            bus.send(msg)
        else:
            await asyncio.sleep(0.1)


async def run(webpubsub_constr, hub_name, user_name, group_name):
    bus = WebPubSubGroup(webpubsub_constr, hub_name, user_name, group_name)
    await bus.connect()
    bus.add_listener(lambda user, msg: handle_message(user, msg))
    await asyncio.gather(
        read_input(bus),
        bus.listen(),
        bus.consume())


if __name__ == '__main__':
    if len(sys.argv) != 5:
        print('Usage: python run.py <connection-string> <hub-name> <user-name> <group-name>')
        exit(1)

    connection_string = sys.argv[1]
    hub_name = sys.argv[2]
    user_name = sys.argv[3]
    group_name = sys.argv[4]

    asyncio.get_event_loop().run_until_complete(
        run(connection_string, hub_name, user_name, group_name))
