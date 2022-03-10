import { ConnectorUpdate } from '@web3-react/types'
import { AbstractConnector } from '@web3-react/abstract-connector'
import warning from 'tiny-warning'
import { SlideInitOptions } from "@slideweb3/sdk"

import { SendReturnResult, SendReturn } from './types'

function parseSendReturn(sendReturn: SendReturnResult | SendReturn): any {
  return sendReturn.hasOwnProperty('result') ? sendReturn.result : sendReturn
}

export class UserRejectedRequestError extends Error {
  public constructor() {
    super()
    this.name = this.constructor.name
    this.message = 'The user rejected the request.'
  }
}

export class SlideConnector extends AbstractConnector {
  slideSdk: any;

  initOptions: SlideInitOptions;

  constructor(_initOptions: SlideInitOptions = {}, initializeImmediately: boolean = false) {
    super({ supportedChainIds: [137] })

    this.initOptions = _initOptions;
    if (initializeImmediately) {
        this.init();
    }

    this.handleNetworkChanged = this.handleNetworkChanged.bind(this)
    this.handleChainChanged = this.handleChainChanged.bind(this)
    this.handleAccountsChanged = this.handleAccountsChanged.bind(this)
    this.handleClose = this.handleClose.bind(this)
  }

  public async init(): Promise<void> {
      if (!this.slideSdk) {
          const SlideSdk = await import('@slideweb3/sdk').then(m => m?.default ?? m);
          this.slideSdk = new SlideSdk(this.initOptions);
          await this.slideSdk.init();
      }
  }

  public async activate(): Promise<ConnectorUpdate> {
    await this.init();

    let account
    try {
      account = await this.slideSdk.request({ method: 'eth_requestAccounts' }).then(
        (sendReturn: any) => parseSendReturn(sendReturn)[0]
      )
    } catch (error) {
      if ((error as any).code === 4001) {
        throw new UserRejectedRequestError()
      }

      throw error;
    }

    if (this.slideSdk.isUsingMetamask && window.ethereum.on) {
      window.ethereum.on('chainChanged', this.handleChainChanged)
      window.ethereum.on('accountsChanged', this.handleAccountsChanged)
      window.ethereum.on('close', this.handleClose)
      window.ethereum.on('networkChanged', this.handleNetworkChanged)
    }

    return { provider: this.slideSdk, ...(account ? { account } : {}) }
  }

  public async getProvider(): Promise<any> {
    return this.slideSdk;
  }

  public async getChainId(): Promise<number | string> {
    let chainId
    try {
      chainId = await this.slideSdk.request({ method: 'eth_chainId' }).then(parseSendReturn)
    } catch (e) {
      warning(false, 'eth_chainId was unsuccessful, falling back to net_version')
    }

    if (!chainId) {
      try {
        chainId = await this.slideSdk.request({ method: 'net_version' }).then(parseSendReturn)
      } catch {
        warning(false, 'net_version was unsuccessful, falling back to net version v2')
      }
    }

    if (!chainId) {
      try {
        chainId = parseSendReturn(await this.slideSdk.request({ method: 'net_version' }))
      } catch {
        warning(false, 'net_version v2 was unsuccessful, falling back to manual matches and static properties')
      }
    }

    return chainId
  }

  public async getAccount(): Promise<null | string> {
    const account = await this.slideSdk.request({ method: 'eth_accounts' }).then((sendReturn: any) => parseSendReturn(sendReturn)[0])

    return account
  }

  public deactivate() {
    this.slideSdk.close();

    if (this.slideSdk.isUsingMetamask && window.ethereum && window.ethereum.removeListener) {
      this.slideSdk.isUsingMetamask = false;

      window.ethereum.removeListener('chainChanged', this.handleChainChanged)
      window.ethereum.removeListener('accountsChanged', this.handleAccountsChanged)
      window.ethereum.removeListener('close', this.handleClose)
      window.ethereum.removeListener('networkChanged', this.handleNetworkChanged)
    }
  }

  public close() {
      this.slideSdk.close();
  }

  public async isAuthorized(): Promise<boolean> {
    try {
      return await this.slideSdk.request({ method: 'eth_accounts' }).then((sendReturn: any) => {
        if (parseSendReturn(sendReturn).length > 0) {
          return true
        } else {
          return false
        }
      })
    } catch {
      return false
    }
  }

  private handleChainChanged(chainId: string | number): void {
    this.emitUpdate({ chainId, provider: window.ethereum })
  }

  private handleAccountsChanged(accounts: string[]): void {
    if (accounts.length === 0) {
      this.emitDeactivate()
    } else {
      this.emitUpdate({ account: accounts[0] })
    }
  }

  private handleClose(_code: number, _reason: string): void {
    this.emitDeactivate()
  }

  private handleNetworkChanged(networkId: string | number): void {
    this.emitUpdate({ chainId: networkId, provider: window.ethereum })
  }
}
