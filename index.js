const {
  checkAvailablityAndRegisterDomain,
  configureARecord,
  requestAndAssociateCertificate,
} = require("./domainAutomation");

const domainName = "occuluszap10.com";
const loadBalancerDNSName =
  "awseb-AWSEB-1HPC61L8II71Y-1353296702.eu-central-1.elb.amazonaws.com";
const loadBalancerArn =
  "arn:aws:elasticloadbalancing:eu-central-1:365257514961:loadbalancer/app/awseb-AWSEB-1HPC61L8II71Y/6d87f22d4a8944a7";

const runSequentially = async () => {
  try {
    await checkAvailablityAndRegisterDomain(domainName);
    await configureARecord(domainName, loadBalancerDNSName);
    await requestAndAssociateCertificate(domainName, loadBalancerArn);
  } catch (error) {
    console.error(error);
  }
};

runSequentially();
