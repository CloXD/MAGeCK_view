# MAGeCK view
A JavaScript project to visualize the results of MAGeCK. 
It's currenlty quite slow, but for a two-days project It's not so bad :) 

## Test on Galaxy
Given the raw count table, you can perform additional tests using galaxy: https://usegalaxy.eu
Search for MAGeCK test ( or MAGeCK mle ), upload the raw count table and seelct the options that you prefer.
All is well documented with a clear explanation of the options, input, output and the method.
Important options: 
 - Gene test FDR-adjusted trhreshold: 0.25 is quite high, I reccommend 0.05
 - Gene Log-Fold Change Method: use Alphamedian or Alphamean to consider in the computation of the logFC only the sgRNA that passed the threshold of significativity.

## MAGeCK view

Open the mageckView.html web page. It's all contained in one document and it performs all the visualization in your browser. 
Despite it doesn't communicate with any server, it requires internet to load some dependencies.
It requires 3 files:
 - sgRNA *raw count* file ( the normalizations for the visualization are performed on the fligh using the same approach as MAGeCK)
 - *.gene_summary.txt file ( output of MAGeCK )
 - *.sgrna_summary.txt file ( output of MAGeCK )

If you reload the page, it should load the previous files uploaded. If you want to change the files, reload with CTRL+F5


### Tables Functionalities: 
 - You can select individual genes by clicking on the row, it will be highlighted in blue. The sgRNA summary will be automatically filtered for those genes and you will see them highlighted in the Plots once refreshed.
 - You can filter the results using the search input text on the top-right of the table and with the Search Builder, that allows more complex filters.
 - You can move the columns by click and drag the header.

### Gene summary
This table contains the informations of the gene_summary.txt with in addition the columns logFC, FDR, p-value. Those correspond to the best values of negative or positive selection of the gene. The best between the two is considered the one with the lowest p-value. In case of tie, the one withe the highest absolute fold change is selected.
The Rank is based on the logFC column ( the best between positive and negative, as described above ).


### sgRNA summary
This table contains the informations of sgrna_summary.txt, nothing more, nothing less.

### Plots
By clicking on the first row of button you can select different types of plots or refresh the current one.
To increase the performances, every time you make a change in the options ( row below the button ) or select a new gene, you need to click again on the button to refresh the plot.
The plots containing the sgRNA counts have different normalization options. The normalization is performed in the same way as MAGeCK does, that's why you need to upload the raw counts matrix.

*Important*: since the volcano plots were quite slow, I kept randomly only 10% of the data in the constant group ( not selected positively nor negatively ). 
This might not be enough when there are many significant data points and the application might slow down, be patient :) 




