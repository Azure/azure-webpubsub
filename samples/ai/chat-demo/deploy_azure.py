#!/usr/bin/env python3
"""A minimal convenience wrapper around Azure Developer CLI (azd) for this chat demo.

Behavior:
	* First run (no existing azd environment folder): creates env then provisions + deploys
	* Subsequent runs: runs `azd deploy` (app code only)

Legacy direct Azure CLI + zip deployment logic has been removed to avoid drift.
You can always invoke azd directly instead of using this script; it's kept for
muscle memory and a discoverable Python entry point.

Prerequisites:
	- Azure Developer CLI installed (https://learn.microsoft.com/azure/developer/azure-developer-cli/)
	- Logged in with `azd auth login` (or already authenticated via Azure CLI / VS Code)
	- Node/npm & Python available (build handled by azd hooks)

Examples:
	python deploy_azure.py                               # auto env name from --base-name (chatdemo)
	python deploy_azure.py --base-name myenv --location eastus
	python deploy_azure.py --azd-env staging-env

Flags retained (small surface):
	--base-name  : default environment name when --azd-env not provided (default: chatdemo)
	--azd-env    : explicit azd environment name
	--location   : only used when creating the environment (maps to `azd env new`)
	--azd-no-up  : attempt `azd deploy` even if environment folder not found (advanced)
"""
from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).parent.resolve()


def run(cmd: list[str]) -> None:
	print(f"==> {' '.join(cmd)}")
	subprocess.run(cmd, check=True)


def parse_args():
	p = argparse.ArgumentParser(description='Azd wrapper (first run = azd up, subsequent = azd deploy)')
	p.add_argument('--location', '-l', help='Azure location (used only on first up)')
	p.add_argument('--base-name', default='chatdemo', help='Base name used as default azd environment name')
	p.add_argument('--azd-env', help='Override azd environment name (defaults to base-name)')
	p.add_argument('--azd-no-up', action='store_true', help='Force deploy even if environment not detected (attempt deploy directly)')
	return p.parse_args()


def _azd_detect_env(env_name: str) -> bool:
	# azd stores env metadata under .azure/{env_name}; we do a lightweight check
	env_dir = ROOT / '.azure' / env_name
	return env_dir.exists()


def _azd_flow(args):
	azd_path = shutil.which('azd')
	if not azd_path:
		print('azd not found in PATH. Install Azure Developer CLI: https://aka.ms/azd')
		sys.exit(1)
	env_name = args.azd_env or args.base_name
	first_time = not _azd_detect_env(env_name)
	if first_time and args.azd_no_up:
		print(f'Environment {env_name} not found but --azd-no-up specified; attempting deploy (may fail).')
	cmd = ['azd', 'up', '--environment', env_name] if first_time and not args.azd_no_up else ['azd', 'deploy', '--environment', env_name]
	if first_time and not args.azd_no_up and args.location:
		cmd += ['--location', args.location]
	if first_time and not args.azd_no_up:
		# Create environment explicitly so we can pass location (since `azd up --location` no longer supported)
		env_new_cmd = ['azd', 'env', 'new', env_name]
		if args.location:
			env_new_cmd += ['--location', args.location]
		print(f"Creating azd environment: {env_name}")
		run(env_new_cmd)
		print("Provisioning infrastructure...")
		run(['azd', 'provision', '--environment', env_name])
		print("Deploying application...")
		run(['azd', 'deploy', '--environment', env_name])
	else:
		print(f"Using existing environment -> deploying: {env_name}")
		run(['azd', 'deploy', '--environment', env_name])
	print('\nAzd flow complete. (Use azd env list/show for outputs.)')


def main():
	args = parse_args()
	_azd_flow(args)
	print('\nNext steps:')
	print(' - azd env list / azd env get-values to inspect environment outputs')
	print(' - Tighten ALLOWED_ORIGINS in production (currently * in template)')
	print(' - Set AZURE=false locally to run self-host WebSocket mode')


if __name__ == '__main__':
	main()

