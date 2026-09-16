"""Generate Python bindings and type stubs from the repository's service schema."""

from pathlib import Path

import grpc_tools
from grpc_tools import protoc


def generate():
    sample = Path(__file__).resolve().parent
    source = sample.parents[2] / 'protocols/protobuf.webpubsub.azure.v1/webpubsub.v1.proto'
    output = sample / 'generated'
    output.mkdir(exist_ok=True)
    result = protoc.main([
        'grpc_tools.protoc',
        f'--proto_path={source.parent}',
        f'--proto_path={Path(grpc_tools.__file__).parent / "_proto"}',
        f'--python_out={output}',
        f'--pyi_out={output}',
        str(source),
    ])
    if result:
        raise RuntimeError(f'Protobuf generation failed with exit code {result}')


if __name__ == '__main__':
    generate()