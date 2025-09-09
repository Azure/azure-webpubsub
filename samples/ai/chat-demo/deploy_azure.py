#!/usr/bin/env python3
"""Deploy the chat demo to Azure using the Bicep template.

Steps:
 1. (Optionally) create resource group
 2. Deploy infra/ main.bicep (App Service + Web PubSub)
 3. Build client (npm build) if dist missing or --build specified
 4. Package whole chat-demo folder (re-uses zip_chat_demo logic) OR create a lightweight zip (default)
 5. Zip deploy to the created web app
 6. Print connection info (web URL, negotiate URL, hub, connection string masked)

Prerequisites:
 - Azure CLI logged in (az login)
 - Correct subscription selected (az account show)
 - Node + npm available to build the client
 - Python 3.11+ (script runtime)

Usage:
  python deploy_azure.py --resource-group myRg --base-name chatdemo --location eastus

Tip: Use a globally unique --base-name to avoid naming collisions.
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
import os

ROOT = Path(__file__).parent.resolve()
INFRA = ROOT / 'infra' / 'main.bicep'
ZIP_SCRIPT = ROOT / 'zip_chat_demo.py'


def run(cmd: list[str], cwd: Path | None = None, capture: bool = False) -> subprocess.CompletedProcess:
	print(f"==> {' '.join(cmd)}")
	try:
		if capture:
			return subprocess.run(cmd, cwd=cwd, check=True, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
		else:
			return subprocess.run(cmd, cwd=cwd, check=True)
	except subprocess.CalledProcessError as e:
		print(f"Command failed: {' '.join(cmd)}")
		if e.stdout:
			print(e.stdout)
		if e.stderr:
			print(e.stderr)
		raise


def check_az() -> None:
	if shutil.which('az') is None:
		print('Azure CLI (az) not found in PATH. Install from https://learn.microsoft.com/cli/azure/install-azure-cli')
		sys.exit(1)
	# quick sanity
	try:
		run(['az', 'version'], capture=False)
	except Exception:
		print('Azure CLI invocation failed. Ensure az works before continuing.')
		sys.exit(1)


def build_client(force: bool) -> None:
	client_dir = ROOT / 'client'
	dist_dir = client_dir / 'dist'
	if force or not dist_dir.exists():
		print('Building client (npm install + npm run build)...')
		run(['npm', 'install'], cwd=client_dir)
		run(['npm', 'run', 'build'], cwd=client_dir)
	else:
		print('Client build skipped (dist exists). Use --build to force rebuild.')


def create_zip(use_full: bool) -> Path:
	if use_full and ZIP_SCRIPT.exists():
		out_zip = ROOT.parent / f"{ROOT.name}.zip"
		run([sys.executable, str(ZIP_SCRIPT), str(out_zip)])
		return out_zip
	# lightweight zip: just package server + built client
	tmp = Path(tempfile.mkdtemp())
	zip_path = tmp / 'deploy.zip'
	import zipfile
	with zipfile.ZipFile(zip_path, 'w', compression=zipfile.ZIP_DEFLATED) as zf:
		# include python server code
		for rel in ['python-server', 'requirements.txt']:
			p = ROOT / rel
			if p.is_dir():
				for dirpath, _, filenames in os.walk(p):
					for fn in filenames:
						ap = Path(dirpath) / fn
						rel_arc = ap.relative_to(ROOT)
						zf.write(ap, rel_arc.as_posix())
			elif p.is_file():
				zf.write(p, p.name)
		# include built client in client/dist -> static
		dist_dir = ROOT / 'client' / 'dist'
		if dist_dir.exists():
			for dirpath, _, filenames in os.walk(dist_dir):
				for fn in filenames:
					ap = Path(dirpath) / fn
					rel_arc = Path('client_dist') / ap.relative_to(dist_dir)
					zf.write(ap, rel_arc.as_posix())
		# startup script (choose python-server/start_server.py or root start_server.py if exists)
		for candidate in ['python-server/start_server.py', 'start_server.py']:
			cpath = ROOT / candidate
			if cpath.exists():
				zf.write(cpath, Path(candidate).as_posix())
		# add a host.json like README for clarity
	print(f'Created lightweight package: {zip_path}')
	return zip_path


def deploy_bicep(args) -> dict:
	params = [f"baseName={args.base_name}", f"hubName={args.hub_name}"]
	if args.location:
		location = args.location
	else:
		# fetch group location
		cp = run(['az', 'group', 'show', '-n', args.resource_group, '-o', 'json'], capture=True)
		location = json.loads(cp.stdout)['location']

	# create RG if requested (idempotent)
	if args.create_group:
		run(['az', 'group', 'create', '-n', args.resource_group, '-l', location])

	print('Deploying Bicep template...')
	cp = run([
		'az', 'deployment', 'group', 'create',
		'-g', args.resource_group,
		'-f', str(INFRA),
		'-p', *params,
		'-o', 'json'
	], capture=True)
	out = json.loads(cp.stdout)
	outputs = out.get('properties', {}).get('outputs', {})
	simplified = {k: v.get('value') for k, v in outputs.items()}
	print('Deployment outputs:')
	for k, v in simplified.items():
		if 'connectionString' in k.lower():
			show = v[:40] + '...' if isinstance(v, str) else '***'
		else:
			show = v
		print(f"  {k}: {show}")
	return simplified


def zip_deploy(web_app: str, resource_group: str, zip_path: Path) -> None:
	print('Starting zip deployment...')
	# Use az webapp deploy (new) if available, else fall back to zip deploy via REST
	try:
		run(['az', 'webapp', 'deploy', '--resource-group', resource_group, '--name', web_app, '--src-path', str(zip_path)])
	except Exception:
		print('Fallback: using kudu zip deploy (az webapp deployment source config-zip)')
		run(['az', 'webapp', 'deployment', 'source', 'config-zip', '--resource-group', resource_group, '--name', web_app, '--src', str(zip_path)])
	print('Zip deployment complete.')


def parse_args():
	p = argparse.ArgumentParser(description='Deploy chat demo infra + code to Azure')
	p.add_argument('--resource-group', '-g', required=True)
	p.add_argument('--base-name', default='chatdemo', help='Base name/prefix for resources (must be globally unique for web app)')
	p.add_argument('--location', '-l', help='Azure location (if creating RG)')
	p.add_argument('--hub-name', default='chat', help='Web PubSub hub name')
	p.add_argument('--build', action='store_true', help='Force rebuild client')
	p.add_argument('--full-zip', action='store_true', help='Use full repo zip (via zip_chat_demo.py)')
	p.add_argument('--create-group', action='store_true', help='Create resource group if missing')
	return p.parse_args()


def main():
	args = parse_args()
	check_az()
	build_client(args.build)
	outputs = deploy_bicep(args)
	web_app_url = outputs.get('webAppUrl')
	web_app_name = (web_app_url or '').split('//')[-1].split('.')[0]
	zip_path = create_zip(args.full_zip)
	zip_deploy(web_app_name, args.resource_group, zip_path)
	print('\nDeployment complete.')
	print(f"Web App: {web_app_url}")
	print(f"Negotiate: {outputs.get('negotiateEndpoint')}")
	print(f"Hub: {outputs.get('hub')}")
	conn = outputs.get('webPubSubConnectionString')
	if conn:
		print(f"Connection String (masked): {conn[:30]}...")
	print('\nNext steps:')
	print(' - Test locally: open the web app URL in a browser')
	print(' - Verify Web PubSub connections in Azure Portal')
	print(' - Restrict ALLOWED_ORIGINS for production security')
	print(' - Set AZURE=false locally to run in self-host WebSocket mode')


if __name__ == '__main__':
	main()

