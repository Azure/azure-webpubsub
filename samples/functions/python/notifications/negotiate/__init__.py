import logging

import azure.functions as func


def main(req: func.HttpRequest, connection) -> func.HttpResponse:
    return func.HttpResponse(connection)